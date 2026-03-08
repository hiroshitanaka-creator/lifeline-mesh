export interface DmeshIdentity {
  v: 1;
  kind: 'dmesh-id';
  name: string;
  fp: string;
  signPK: string;
  boxPK: string;
}

export interface DmeshMessage {
  v: 1;
  kind: 'dmesh-msg';
  ts: number;
  senderSignPK: string;
  senderBoxPK: string;
  recipientBoxPK: string;
  ephPK: string;
  nonce: string;
  ciphertext: string;
  signature: string;
  ttl?: number;
  exp?: number;
  msgId?: string;
}

export interface DmeshChunk {
  v: 1;
  kind: 'dmesh-chunk';
  msgId: string;
  seq: number;
  total: number;
  data: string;
}

export interface GroupMember {
  fp: string;
  name: string;
  signPK: string;
  boxPK: string;
  role: 'admin' | 'member';
  addedAt: number;
}

export interface GroupState {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  members: GroupMember[];
  senderKey: {
    version: number;
    chainKey: string;
  };
}

export interface GroupMessage {
  v: 1;
  kind: 'dmesh-group-msg';
  groupId: string;
  ts: number;
  senderSignPK: string;
  senderKeyVersion: number;
  nonce: string;
  ciphertext: string;
  signature: string;
}
