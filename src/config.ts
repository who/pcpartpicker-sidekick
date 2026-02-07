import dotenv from "dotenv";

dotenv.config();

interface Config {
  username: string;
  password: string;
  apiKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config: Config = {
  username: requireEnv("PCPARTPICKER_USERNAME"),
  password: requireEnv("PCPARTPICKER_PASSWORD"),
  apiKey: requireEnv("ANTHROPIC_API_KEY"),
};

export default config;
export type { Config };
