import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
} else {
  writeFileSync(
    ".env.local",
    `DATABASE_URL=postgresql://harness:harness@127.0.0.1:55439/harness\nAI_PROVIDER=bedrock\nBEDROCK_REGION=us-east-2\nBEDROCK_API_KEY=replace-with-your-bedrock-api-key\nOPENAI_API_KEY=replace-with-your-openai-key\nOPERATOR_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created .env.local. Configure your provider key. The generated OPERATOR_TOKEN unlocks the reviewer panel.",
  );
}
