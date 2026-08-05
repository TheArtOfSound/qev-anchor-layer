//! LiteSVM tests for qal-anchor.
//! Requires `anchor build` so `target/deploy/qal_anchor.so` exists.

use {
    anchor_lang::{
        prelude::Pubkey as AnchorPubkey, InstructionData, ToAccountMetas,
    },
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

#[test]
fn initialize_protocol_anchor_and_status_transitions() {
    let program_id_anchor = qal_anchor::id();
    let program_id = pk(program_id_anchor);
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/qal_anchor.so");
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();

    let (protocol, _) =
        AnchorPubkey::find_program_address(&[b"qal", b"protocol"], &program_id_anchor);

    // initialize_protocol
    let init_data = qal_anchor::instruction::InitializeProtocol {}.data();
    let init_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(pk(protocol), false),
            AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
        ],
        data: init_data,
    };
    send(&mut svm, &payer, init_ix);

    // anchor_vault
    let mut vault_digest = [0u8; 32];
    vault_digest[0] = 0xab;
    let mut schema_hash = [0u8; 32];
    schema_hash[0] = 0xcd;
    let content_ref = [0u8; 32];
    let parent = [0u8; 32];
    let flags: u16 = 0;

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

    let anchor_data = qal_anchor::instruction::AnchorVault {
        vault_digest,
        qev_schema_hash: schema_hash,
        content_ref_hash: content_ref,
        parent_digest: parent,
        flags,
    }
    .data();

    let anchor_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(pk(protocol), false),
            AccountMeta::new(pk(anchor_pda), false),
            AccountMeta::new(pk(status_pda), false),
            AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
        ],
        data: anchor_data,
    };
    send(&mut svm, &payer, anchor_ix);

    // reject zero digest
    let zero = [0u8; 32];
    let (z_anchor, _) = AnchorPubkey::find_program_address(
        &[b"qal", issuer_anchor.as_ref(), zero.as_ref()],
        &program_id_anchor,
    );
    let (z_status, _) = AnchorPubkey::find_program_address(
        &[b"qal", b"status", issuer_anchor.as_ref(), zero.as_ref()],
        &program_id_anchor,
    );
    let zero_data = qal_anchor::instruction::AnchorVault {
        vault_digest: zero,
        qev_schema_hash: schema_hash,
        content_ref_hash: content_ref,
        parent_digest: parent,
        flags: 0,
    }
    .data();
    let zero_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(pk(protocol), false),
            AccountMeta::new(pk(z_anchor), false),
            AccountMeta::new(pk(z_status), false),
            AccountMeta::new_readonly(pk(anchor_lang::system_program::ID), false),
        ],
        data: zero_data,
    };
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[zero_ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&payer]).unwrap();
    assert!(svm.send_transaction(tx).is_err(), "zero digest must fail");

    // set_status → revoked
    let status_data = qal_anchor::instruction::SetStatus { new_state: 1 }.data();
    let status_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer.pubkey(), true),
            AccountMeta::new_readonly(pk(anchor_pda), false),
            AccountMeta::new(pk(status_pda), false),
        ],
        data: status_data,
    };
    send(&mut svm, &payer, status_ix);

    // unauthorized controller transfer attempt
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let new_controller = stranger.pubkey();
    let xfer_data = qal_anchor::instruction::TransferController {
        new_controller: AnchorPubkey::new_from_array(new_controller.to_bytes()),
    }
    .data();
    let bad_xfer = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(stranger.pubkey(), true),
            AccountMeta::new(pk(anchor_pda), false),
            AccountMeta::new(pk(status_pda), false),
        ],
        data: xfer_data,
    };
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[bad_xfer], Some(&stranger.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&stranger]).unwrap();
    assert!(
        svm.send_transaction(tx).is_err(),
        "stranger must not transfer controller"
    );

    // authorized transfer — issuer preserved on account data (checked by success + re-read length)
    let xfer_ok_data = qal_anchor::instruction::TransferController {
        new_controller: AnchorPubkey::new_from_array(new_controller.to_bytes()),
    }
    .data();
    let good_xfer = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(payer.pubkey(), true),
            AccountMeta::new(pk(anchor_pda), false),
            AccountMeta::new(pk(status_pda), false),
        ],
        data: xfer_ok_data,
    };
    send(&mut svm, &payer, good_xfer);

    let anchor_acct = svm.get_account(&pk(anchor_pda)).expect("anchor account");
    // layout: disc(8) + version(1) + bump(1) + issuer(32) + controller(32) + ...
    let issuer_bytes = &anchor_acct.data[10..42];
    assert_eq!(issuer_bytes, payer.pubkey().as_ref(), "issuer must remain original");
    let controller_bytes = &anchor_acct.data[42..74];
    assert_eq!(
        controller_bytes,
        new_controller.as_ref(),
        "controller should update"
    );
}

// Silence unused import warning if ToAccountMetas not used
#[allow(dead_code)]
fn _touch_traits() {
    let _ = std::any::type_name::<fn() -> dyn ToAccountMetas>();
}
