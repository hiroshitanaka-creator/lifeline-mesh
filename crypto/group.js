/**
 * Lifeline Mesh - Minimal Group Messaging (create, send, decrypt)
 */

const GROUP_DOMAIN = "DMESH_GROUP_V1";
const GROUP_MSG_KEY_INFO = "DMESH_GROUP_MSG_KEY";
export const GROUP_SENDER_STATE_KIND = "dmesh-group-sender-state";

function buildGroupSignBytes({ groupId, senderKeyVersion, nonce, ciphertext }, naclUtil) {
  const domain = naclUtil.decodeUTF8(GROUP_DOMAIN);
  const groupIdBytes = naclUtil.decodeUTF8(groupId);
  const versionBytes = new Uint8Array([senderKeyVersion & 0xff]);
  return new Uint8Array([
    ...domain,
    ...groupIdBytes,
    ...versionBytes,
    ...nonce,
    ...ciphertext
  ]);
}

export function createGroup({ name, createdBy, members = [] }, nacl, naclUtil) {
  const seed = nacl.randomBytes(16);
  const groupId = naclUtil.encodeBase64(seed);
  const now = Date.now();

  const senderKey = {
    version: 1,
    chainKey: nacl.randomBytes(32)
  };

  return {
    id: groupId,
    name,
    createdAt: now,
    createdBy,
    members,
    senderKey: {
      version: senderKey.version,
      chainKey: naclUtil.encodeBase64(senderKey.chainKey)
    }
  };
}

export function hydrateSenderKey(senderKey, naclUtil) {
  return {
    version: senderKey.version,
    chainKey: naclUtil.decodeBase64(senderKey.chainKey)
  };
}

export function deriveMessageKey(chainKey, nacl, naclUtil) {
  const info = naclUtil.decodeUTF8(GROUP_MSG_KEY_INFO);
  return nacl.hash(new Uint8Array([...chainKey, ...info])).slice(0, 32);
}

export function ratchetChainKey(chainKey, nacl) {
  return nacl.hash(chainKey).slice(0, 32);
}

export function encryptGroupMessage({ content, groupId, senderKey, senderSignPK, senderSignSK }, nacl, naclUtil) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ts = Date.now();
  const messageKey = deriveMessageKey(senderKey.chainKey, nacl, naclUtil);

  const payload = naclUtil.decodeUTF8(JSON.stringify({ v: 1, ts, content }));
  const ciphertext = nacl.secretbox(payload, nonce, messageKey);

  const signature = nacl.sign.detached(
    buildGroupSignBytes({ groupId, senderKeyVersion: senderKey.version, nonce, ciphertext }, naclUtil),
    senderSignSK
  );

  return {
    message: {
      v: 1,
      kind: "dmesh-group-msg",
      groupId,
      ts,
      senderSignPK: naclUtil.encodeBase64(senderSignPK),
      senderKeyVersion: senderKey.version,
      nonce: naclUtil.encodeBase64(nonce),
      ciphertext: naclUtil.encodeBase64(ciphertext),
      signature: naclUtil.encodeBase64(signature)
    },
    nextSenderKey: {
      version: senderKey.version + 1,
      chainKey: ratchetChainKey(senderKey.chainKey, nacl)
    }
  };
}

export function decryptGroupMessage({ message, senderKey, expectedSenderSignPK = null }, nacl, naclUtil) {
  const senderSignPK = naclUtil.decodeBase64(message.senderSignPK);

  if (expectedSenderSignPK && !nacl.verify(expectedSenderSignPK, senderSignPK)) {
    throw new Error("Sender signing key mismatch");
  }

  const nonce = naclUtil.decodeBase64(message.nonce);
  const ciphertext = naclUtil.decodeBase64(message.ciphertext);
  const signature = naclUtil.decodeBase64(message.signature);

  const signBytes = buildGroupSignBytes({
    groupId: message.groupId,
    senderKeyVersion: message.senderKeyVersion,
    nonce,
    ciphertext
  }, naclUtil);

  if (!nacl.sign.detached.verify(signBytes, signature, senderSignPK)) {
    throw new Error("Invalid group message signature");
  }

  const messageKey = deriveMessageKey(senderKey.chainKey, nacl, naclUtil);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, messageKey);

  if (!plaintext) {
    throw new Error("Group message decryption failed");
  }

  const payload = JSON.parse(naclUtil.encodeUTF8(plaintext));

  return {
    payload,
    nextSenderKey: {
      version: senderKey.version + 1,
      chainKey: ratchetChainKey(senderKey.chainKey, nacl)
    }
  };
}

export function resolveSenderKeyForMessage(senderState, message, naclUtil) {
  if (!senderState) {
    throw new Error("Missing sender state for group sender. Import sender-state JSON and retry.");
  }

  if (senderState.version === message.senderKeyVersion) {
    return hydrateSenderKey(senderState, naclUtil);
  }

  if (senderState.prevVersion === message.senderKeyVersion && senderState.prevChainKey) {
    return hydrateSenderKey({ version: senderState.prevVersion, chainKey: senderState.prevChainKey }, naclUtil);
  }

  throw new Error(
    `SenderKey version mismatch (have v${senderState.version}, message v${message.senderKeyVersion}). Import sender-state JSON to resync.`
  );
}

export function createSenderKeyStateMessage({ groupId, senderSignPK, senderKey }, naclUtil) {
  return {
    v: 1,
    kind: GROUP_SENDER_STATE_KIND,
    groupId,
    senderSignPK,
    senderKey: {
      version: senderKey.version,
      chainKey: naclUtil.encodeBase64(senderKey.chainKey)
    },
    issuedAt: Date.now()
  };
}
