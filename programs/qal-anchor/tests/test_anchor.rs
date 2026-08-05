//! LiteSVM tests for qal-anchor v2 (immutable anchor, no global counter, atomic supersede).
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

#[test]
fn anchor_status_transfer_supersede() {
    let program_id_anchor = qal_anchor::id();
    let program_id = pk(program_id_anchor);
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/qal_anchor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let mut vault_digest = [0u8; 32];
    vault_digest[0] = 0xab;
    let mut schema_hash = [0u8; 32];
    schema_hash[0] = 0xcd;
    let content_ref = [0u8; 32];
    let parent = [0u8; 32];

    let issuer_anchor = AnchorPubkey::new_from_array(payer.pubkey().to_bytes());
    let (anchor_pda, _) = AnchorPubkey::find_program_address(
        &[b"qal", issuer_anchor.as_ref(), vault_digest.as_ref()],
        &program_id_anchor,
    );
    let (status_pda, _) = AnchorPubkey::find_program_address(
        &[
            b"qal",
            b"status",
            issuer_anchor.as_ref(),
            vault_digest.as_ref(),
        ],
        &program_id_anchor,
    );

    // unknown flags rejected
    let bad_flags = qal_anchor::instruction::AnchorVault {
        vault_digest,
        qev_schema_hash: schema_hash,
        content_ref_hash: content_ref,
        parent_digest_claim: parent,
        flags: 1 << 7,
    }
    .data();
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: bad_flags,
        },
    );

    // zero digest rejected
    let zero = [0u8; 32];
    let (z_a, _) = AnchorPubkey::find_program_address(
        &[b"qal", issuer_anchor.as_ref(), zero.as_ref()],
        &program_id_anchor,
    );
    let (z_s, _) = AnchorPubkey::find_program_address(
        &[b"qal", b"status", issuer_anchor.as_ref(), zero.as_ref()],
        &program_id_anchor,
    );
    send_err(
        &mut svm,
        &payer,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(pk(z_a), false),
                AccountMeta::new(pk(z_s), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: qal_anchor::instruction::AnchorVault {
                vault_digest: zero,
                qev_schema_hash: schema_hash,
                content_ref_hash: content_ref,
                parent_digest_claim: parent,
                flags: 0,
            }
            .data(),
        },
    );

    // happy path anchor
    send(
        &mut svm,
        &payer,
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
                content_ref_hash: content_ref,
                parent_digest_claim: parent,
                flags: 0,
            }
            .data(),
        },
    );

    // anchor layout: disc(8) + version(1) + bump(1) + issuer(32) — no controller
    let anchor_acct = svm.get_account(&pk(anchor_pda)).expect("anchor");
    assert_eq!(anchor_acct.data[8], 2, "version must be 2");
    let issuer_bytes = &anchor_acct.data[10..42];
    assert_eq!(issuer_bytes, payer.pubkey().as_ref());

    // unauthorized set_status
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    send_err(
        &mut svm,
        &stranger,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new_readonly(stranger.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
            ],
            data: qal_anchor::instruction::SetStatus { new_state: 1 }.data(),
        },
    );

    // authorized revoke
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

    // transfer controller (status only)
    let new_controller = stranger.pubkey();
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
            data: qal_anchor::instruction::TransferController {
                new_controller: AnchorPubkey::new_from_array(new_controller.to_bytes()),
            }
            .data(),
        },
    );

    // issuer on immutable anchor unchanged
    let anchor_acct = svm.get_account(&pk(anchor_pda)).unwrap();
    assert_eq!(&anchor_acct.data[10..42], payer.pubkey().as_ref());

    // atomic supersede by new controller
    let mut new_digest = [0u8; 32];
    new_digest[0] = 0xef;
    let (new_a, _) = AnchorPubkey::find_program_address(
        &[b"qal", issuer_anchor.as_ref(), new_digest.as_ref()],
        &program_id_anchor,
    );
    let (new_s, _) = AnchorPubkey::find_program_address(
        &[
            b"qal",
            b"status",
            issuer_anchor.as_ref(),
            new_digest.as_ref(),
        ],
        &program_id_anchor,
    );

    send(
        &mut svm,
        &stranger,
        Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(stranger.pubkey(), true),
                AccountMeta::new_readonly(pk(anchor_pda), false),
                AccountMeta::new(pk(status_pda), false),
                AccountMeta::new(pk(new_a), false),
                AccountMeta::new(pk(new_s), false),
                AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
            ],
            data: qal_anchor::instruction::SupersedeVault {
                new_vault_digest: new_digest,
                new_qev_schema_hash: schema_hash,
                new_content_ref_hash: content_ref,
                new_flags: 0,
            }
            .data(),
        },
    );

    // old status superseded (layout: disc8 + anchor32 + controller32 + state u8)
    let status_acct = svm.get_account(&pk(status_pda)).unwrap();
    let state = status_acct.data[8 + 32 + 32];
    assert_eq!(state, 2, "old status must be superseded");

    // new parent claim == old digest
    let new_anchor = svm.get_account(&pk(new_a)).unwrap();
    // disc8 + ver1 + bump1 + issuer32 + vault_digest32 + schema32 + content32 + parent32
    let parent_off = 8 + 2 + 32 + 32 + 32 + 32;
    assert_eq!(
        &new_anchor.data[parent_off..parent_off + 32],
        &vault_digest,
        "parent_digest_claim must equal old digest"
    );
}
