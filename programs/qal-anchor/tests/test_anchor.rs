//! LiteSVM tests: immutable anchor, transitions, atomic supersede, successor lock.
//! Requires `anchor build` so `target/deploy/qal_anchor.so` exists.

use {
    anchor_lang::{prelude::Pubkey as AnchorPubkey, InstructionData},
    litesvm::LiteSVM,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn pk(p: AnchorPubkey) -> Pubkey {
    Pubkey::new_from_array(p.to_bytes())
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "tx failed: {:?}", res.err());
}

fn send_err(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

fn setup() -> (LiteSVM, Keypair, Pubkey, AnchorPubkey) {
    let program_id_anchor = qal_anchor::id();
    let program_id = pk(program_id_anchor);
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/qal_anchor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    (svm, payer, program_id, program_id_anchor)
}

fn pdas(
    issuer: &AnchorPubkey,
    digest: &[u8; 32],
    program_id_anchor: &AnchorPubkey,
) -> (AnchorPubkey, AnchorPubkey) {
    let (a, _) = AnchorPubkey::find_program_address(
        &[b"qal", issuer.as_ref(), digest.as_ref()],
        program_id_anchor,
    );
    let (s, _) = AnchorPubkey::find_program_address(
        &[b"qal", b"status", issuer.as_ref(), digest.as_ref()],
        program_id_anchor,
    );
    (a, s)
}

fn anchor_ix(
    program_id: Pubkey,
    payer: &Keypair,
    anchor_pda: AnchorPubkey,
    status_pda: AnchorPubkey,
    vault_digest: [u8; 32],
    schema_hash: [u8; 32],
    flags: u16,
) -> Instruction {
    Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(pk(anchor_pda), false),
            AccountMeta::new(pk(status_pda), false),
            AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
        ],
        data: qal_anchor::instruction::AnchorVault {
            vault_digest,
            qev_schema_hash: schema_hash,
            content_ref_hash: [0u8; 32],
            parent_digest_claim: [0u8; 32],
            flags,
        }
        .data(),
    }
}

#[test]
fn full_transition_and_supersede_matrix() {
    let (mut svm, payer, program_id, program_id_anchor) = setup();
    let issuer_anchor = AnchorPubkey::new_from_array(payer.pubkey().to_bytes());

    let mut vault_digest = [0u8; 32];
    vault_digest[0] = 0xab;
    let mut schema_hash = [0u8; 32];
    schema_hash[0] = 0xcd;
    let (anchor_pda, status_pda) = pdas(&issuer_anchor, &vault_digest, &program_id_anchor);

    // unknown flags rejected
    send_err(
        &mut svm,
        &payer,
        anchor_ix(
            program_id,
            &payer,
            anchor_pda,
            status_pda,
            vault_digest,
            schema_hash,
            1 << 7,
        ),
    );

    // happy path
    send(
        &mut svm,
        &payer,
        anchor_ix(
            program_id,
            &payer,
            anchor_pda,
            status_pda,
            vault_digest,
            schema_hash,
            0,
        ),
    );

    // manual superseded via set_status must fail
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 2 }.data(),
        },
    );

    // active → disputed ok
    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 3 }.data(),
        },
    );

    // disputed → active ok
    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 0 }.data(),
        },
    );

    // supersede
    let mut new_digest = [0u8; 32];
    new_digest[0] = 0xef;
    let (new_a, new_s) = pdas(&issuer_anchor, &new_digest, &program_id_anchor);

    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
                AccountMeta::new(pk(new_a), false),
                AccountMeta::new(pk(new_s), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: qal_anchor::instruction::SupersedeVault {
                new_vault_digest: new_digest,
                new_qev_schema_hash: schema_hash,
                new_content_ref_hash: [0u8; 32],
                new_flags: 0,
            }
            .data(),
        },
    );

    // old status = superseded (2); successor_digest stored
    let status_acct = svm.get_account(&pk(status_pda)).unwrap();
    // disc8 + anchor32 + controller32 + state1 + updated_slot8 + bump1 + version1 + successor32
    let state = status_acct.data[8 + 32 + 32];
    assert_eq!(state, 2);
    let succ_off = 8 + 32 + 32 + 1 + 8 + 1 + 1;
    assert_eq!(&status_acct.data[succ_off..succ_off + 32], &new_digest);

    // reactivation after supersession fails
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 0 }.data(),
        },
    );

    // second successor attempt fails
    let mut third = [0u8; 32];
    third[0] = 0x11;
    let (t_a, t_s) = pdas(&issuer_anchor, &third, &program_id_anchor);
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
                AccountMeta::new(pk(t_a), false),
                AccountMeta::new(pk(t_s), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: qal_anchor::instruction::SupersedeVault {
                new_vault_digest: third,
                new_qev_schema_hash: schema_hash,
                new_content_ref_hash: [0u8; 32],
                new_flags: 0,
            }
            .data(),
        },
    );
}

#[test]
fn revoked_is_terminal_and_blocks_supersede() {
    let (mut svm, payer, program_id, program_id_anchor) = setup();
    let issuer_anchor = AnchorPubkey::new_from_array(payer.pubkey().to_bytes());
    let mut vault_digest = [0u8; 32];
    vault_digest[0] = 0x22;
    let mut schema_hash = [0u8; 32];
    schema_hash[0] = 0x33;
    let (anchor_pda, status_pda) = pdas(&issuer_anchor, &vault_digest, &program_id_anchor);

    send(
        &mut svm,
        &payer,
        anchor_ix(
            program_id,
            &payer,
            anchor_pda,
            status_pda,
            vault_digest,
            schema_hash,
            0,
        ),
    );

    // revoke
    send(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 1 }.data(),
        },
    );

    // cannot re-activate
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 0 }.data(),
        },
    );

    // cannot supersede revoked
    let mut new_digest = [0u8; 32];
    new_digest[0] = 0x44;
    let (new_a, new_s) = pdas(&issuer_anchor, &new_digest, &program_id_anchor);
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
                AccountMeta::new(pk(new_a), false),
                AccountMeta::new(pk(new_s), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: qal_anchor::instruction::SupersedeVault {
                new_vault_digest: new_digest,
                new_qev_schema_hash: schema_hash,
                new_content_ref_hash: [0u8; 32],
                new_flags: 0,
            }
            .data(),
        },
    );
}
