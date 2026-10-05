import { google } from "googleapis";
import sharp from "sharp";
import convert from "heic-convert";

import { uploadToR2 } from "@/lib/r2";

const MAX_SIZE = 2400;
const QUALITY = 85;

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials/mountain-book-dyeshop-8fa756f38c7c.json",
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

type UploadedFile = {
  name: string;
  type: "image" | "video";
};

export async function downloadLogMedia(slug: string): Promise<UploadedFile[]> {
  if (!slug) {
    throw new Error("slugを指定してください");
  }

  const drive = google.drive({
    version: "v3",
    auth,
  });

  const response = await drive.files.list({
    q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${slug}'`,
    fields: "files(id, name)",
    pageSize: 100,
  });

  const folders = response.data.files;

  if (!folders || folders.length === 0) {
    throw new Error(`フォルダ '${slug}' が見つかりません`);
  }

  if (folders.length > 1) {
    const folderList = folders
      .map(
        (folder) =>
          `${folder.name ?? "(名前なし)"} (${folder.id ?? "(IDなし)"})`,
      )
      .join(", ");

    throw new Error(
      `ログフォルダ '${slug}' が複数見つかりました: ${folderList}`,
    );
  }

  const logFolder = folders[0];

  if (!logFolder.id || !logFolder.name) {
    throw new Error("ログフォルダの情報を取得できませんでした");
  }

  console.log(`ログフォルダ: ${logFolder.name} (${logFolder.id})`);

  const fileResponse = await drive.files.list({
    q: `'${logFolder.id}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size)",
    orderBy: "name",
  });

  const files = fileResponse.data.files;

  if (!files || files.length === 0) {
    console.log("ファイルがありません");
    return [];
  }

  const uploadedFiles: UploadedFile[] = [];

  for (const file of files) {
    if (!file.id || !file.name || !file.mimeType) {
      console.log("スキップ: ファイル情報が不足しています");
      continue;
    }

    // --------------------
    // 画像
    // --------------------
    if (file.mimeType.startsWith("image/")) {
      const outputName = file.name.replace(/\.[^.]+$/i, ".jpg");
      const r2Key = `logs/${slug}/img/${outputName}`;

      console.log(`画像ダウンロード: ${file.name}`);

      const response = await drive.files.get(
        {
          fileId: file.id,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        },
      );

      const inputBuffer = Buffer.from(response.data as ArrayBuffer);
      const beforeSize = inputBuffer.length;

      let imageBuffer = inputBuffer;

      // HEIC / HEIF → JPEG
      if (/\.(heic|heif)$/i.test(file.name)) {
        console.log("  → HEIC/HEIFをJPEGへ変換");

        const converted = await convert({
          buffer: inputBuffer,
          format: "JPEG",
          quality: 1,
        });

        imageBuffer = Buffer.from(converted);
      }

      // リサイズ・JPEG圧縮
      imageBuffer = await sharp(imageBuffer)
        .rotate()
        .resize({
          width: MAX_SIZE,
          height: MAX_SIZE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: QUALITY,
          mozjpeg: true,
        })
        .toBuffer();

      const afterSize = imageBuffer.length;
      const reduction = (1 - afterSize / beforeSize) * 100;

      console.log(
        `  → ${outputName} ` +
          `${(beforeSize / 1024 / 1024).toFixed(2)} MB → ` +
          `${(afterSize / 1024 / 1024).toFixed(2)} MB ` +
          `(${reduction.toFixed(1)}%削減)`,
      );

      // R2へアップロード
      await uploadToR2(r2Key, imageBuffer, "image/jpeg");

      uploadedFiles.push({
        name: outputName,
        type: "image",
      });

      console.log(`  → R2アップロード完了: ${r2Key}`);

      continue;
    }

    // --------------------
    // 動画
    // --------------------
    if (file.mimeType.startsWith("video/")) {
      const r2Key = `logs/${slug}/vid/${file.name}`;

      console.log(`動画ダウンロード: ${file.name}`);

      const response = await drive.files.get(
        {
          fileId: file.id,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        },
      );

      const videoBuffer = Buffer.from(response.data as ArrayBuffer);

      // R2へアップロード
      await uploadToR2(r2Key, videoBuffer, file.mimeType);

      uploadedFiles.push({
        name: file.name,
        type: "video",
      });

      console.log(`  → R2アップロード完了: ${r2Key}`);

      continue;
    }

    console.log(`スキップ: ${file.name} (${file.mimeType})`);
  }

  console.log("\nダウンロード・R2アップロード完了");

  return uploadedFiles;
}
