import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * 暗号化キーを環境変数から読み込み、32バイトか確認します。
 *
 * 1. Base64値を取得します。
 * 2. バイト長を確認し、鍵を返します。
 * @example getEncryptionKey() // => Buffer (32 bytes)
 */
function getEncryptionKey() {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("APP_ENCRYPTION_KEYが設定されていません");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEYは32バイトのBase64値である必要があります");
  return key;
}

/**
 * 暗号化キーを使ってトークンを認証付き暗号文にします。
 *
 * 1. ランダムなIVを生成します。
 * 2. AES-256-GCMで平文を暗号化します。
 * 3. IV、認証タグ、暗号文をBase64で連結して返します。
 * @example encryptSecret("token") // => "<iv>.<tag>.<ciphertext>"
 */
export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(".");
}

/**
 * 保存形式を検証し、認証に成功したトークンだけを復号します。
 *
 * 1. 暗号文を3つのBase64パーツに分割します。
 * 2. IVとタグの長さを確認します。
 * 3. GCM認証を検証し、平文を返します。
 * @example decryptSecret("<iv>.<tag>.<ciphertext>") // => "token"
 */
export function decryptSecret(encrypted: string) {
  // ドットで区切ったIV・認証タグ・暗号文の3パーツ以外は受け付けません。
  const parts = encrypted.split(".");
  if (parts.length !== 3) throw new Error("暗号文の形式が不正です");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
  if (iv.length !== IV_LENGTH || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("暗号文の形式が不正です");
  }
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
