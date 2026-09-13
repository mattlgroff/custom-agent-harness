import { createOpenAI } from "@ai-sdk/openai";
import { MODEL } from "./fixtures";

export function modelConfiguration(model: string = MODEL) {
  const provider = process.env.AI_PROVIDER || "openai";
  if (provider === "bedrock") {
    const region = process.env.BEDROCK_REGION || "us-east-2";
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
      throw new Error("Invalid BEDROCK_REGION.");
    return {
      provider,
      apiKey: process.env.BEDROCK_API_KEY,
      baseURL: `https://bedrock-mantle.${region}.api.aws/openai/v1`,
      modelId: `openai.${model}`,
    };
  }
  if (provider !== "openai")
    throw new Error("AI_PROVIDER must be openai or bedrock.");
  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1",
    modelId: model,
  };
}

export function supportModel(model: string = MODEL) {
  const { apiKey, baseURL, modelId } = modelConfiguration(model);
  if (!apiKey || apiKey.startsWith("replace-"))
    throw new Error("Configure the selected provider API key in .env.local.");
  return createOpenAI({ apiKey, baseURL }).responses(modelId);
}
