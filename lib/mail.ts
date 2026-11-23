import { connect } from "node:tls";

const RECIPIENT = "seekeinosok@gmail.com";

/**
 * Gmail SMTPへ接続し、トークン更新の結果を指定先へ通知します。
 *
 * 1. 環境変数から送信者とアプリパスワードを読み取ります。
 * 2. TLS接続でSMTP認証とメール送信を行います。
 * 3. DATA終端後のSMTP応答を確認して完了します。
 * @example await sendTokenRefreshEmail(true, "Instagramトークンを更新しました")
 */
export async function sendTokenRefreshEmail(success: boolean, detail: string) {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!user || !password) throw new Error("Gmail SMTPの設定がありません");

  const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
  socket.setEncoding("utf8");
  let buffer = "";
  const pending: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\r\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (/^\d{3} /.test(line)) pending.shift()?.resolve(line);
    }
  });
  socket.on("error", (error) => {
    for (const waiter of pending.splice(0)) waiter.reject(error);
  });
  const response = () => new Promise<string>((resolve, reject) => pending.push({ resolve, reject }));
  const command = async (value: string, expected: string) => {
    const answer = response();
    socket.write(`${value}\r\n`);
    const line = await answer;
    if (!line.startsWith(expected)) throw new Error("Gmail SMTPが要求を拒否しました");
  };

  try {
    const greeting = response();
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    const hello = await greeting;
    if (!hello.startsWith("220")) throw new Error("Gmail SMTPへ接続できませんでした");
    await command("EHLO worktable", "250");
    await command("AUTH LOGIN", "334");
    await command(Buffer.from(user).toString("base64"), "334");
    await command(Buffer.from(password).toString("base64"), "235");
    await command(`MAIL FROM:<${user}>`, "250");
    await command(`RCPT TO:<${RECIPIENT}>`, "25");
    await command("DATA", "354");
    const subject = success ? "Instagramトークン更新成功" : "Instagramトークン更新失敗";
    const message = [
      `From: ${user}`, `To: ${RECIPIENT}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "",
      detail, ".",
    ].join("\r\n");
    await command(message, "250");
    await command("QUIT", "221");
  } finally {
    socket.end();
  }
}
