import readline from "node:readline";

/**
 * Prompt for a secret without echoing. Never accept --password on CLI.
 */
export async function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-interactive: read one line from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Hide input by muting stdout write for the password line.
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode?.(true);
    }

    process.stdout.write(label);

    let value = "";
    const onData = (buf: Buffer) => {
      const s = buf.toString("utf8");
      for (const ch of s) {
        if (ch === "\n" || ch === "\r" || ch === "\u0004") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode?.(wasRaw ?? false);
      }
      rl.close();
    };

    stdin.on("data", onData);
  });
}
