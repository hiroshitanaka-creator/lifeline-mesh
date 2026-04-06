/**
 * Lifeline Mesh - Minimal Group Messaging (create, send, decrypt)
 */

const GROUP_DOMAIN = "DMESH_GROUP_V1";
const GROUP_MSG_KEY_INFO = "DMESH_GROUP_MSG_KEY";
const GROUP_PAYLOAD_ENVELOPE_DOMAIN = "DMESH_GROUP_PAYLOAD_ENVELOPE_V1";

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

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalizeValue(value[key]);
  }
  return sorted;
}

function canonicalizeJson(value) {
  return JSON.stringify(canonicalizeValue(value));
}

function buildPayloadEnvelopeSignBytes(
  { payloadType, payloadVersion, payloadBody, exportedAt, exportedBySignPK },
  naclUtil
) {
  const signMaterial = {
    domain: GROUP_PAYLOAD_ENVELOPE_DOMAIN,
    payloadType,
    payloadVersion,
    exportedAt,
    exportedBySignPK,
    payload: payloadBody
  };
  return naclUtil.decodeUTF8(canonicalizeJson(signMaterial));
}

export function createSignedGroupPayloadEnvelope(
  { payloadType, payloadVersion = 1, payloadBody, exportedAt = Date.now(), exportedBySignPK, signerSignSK },
  nacl,
  naclUtil
) {
  if (!payloadType || !payloadBody || !exportedBySignPK || !signerSignSK) {
    throw new Error("Invalid signed payload envelope inputs");
  }

  const signBytes = buildPayloadEnvelopeSignBytes({
    payloadType,
    payloadVersion,
    payloadBody,
    exportedAt,
    exportedBySignPK
  }, naclUtil);

  const signature = nacl.sign.detached(signBytes, signerSignSK);

  return {
    type: "lifeline-signed-envelope-v1",
    payloadType,
    payloadVersion,
    exportedAt,
    exportedBySignPK,
    payload: payloadBody,
    signature: naclUtil.encodeBase64(signature)
  };
}

export function verifySignedGroupPayloadEnvelope(envelope, nacl, naclUtil) {
  if (!envelope || envelope.type !== "lifeline-signed-envelope-v1") {
    throw new Error("Signed payload envelope required");
  }

  const signerSignPK = naclUtil.decodeBase64(envelope.exportedBySignPK);
  const signature = naclUtil.decodeBase64(envelope.signature);
  const signBytes = buildPayloadEnvelopeSignBytes({
    payloadType: envelope.payloadType,
    payloadVersion: envelope.payloadVersion,
    payloadBody: envelope.payload,
    exportedAt: envelope.exportedAt,
    exportedBySignPK: envelope.exportedBySignPK
  }, naclUtil);

  if (!nacl.sign.detached.verify(signBytes, signature, signerSignPK)) {
    throw new Error("Invalid group payload signature");
  }

  return true;
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
