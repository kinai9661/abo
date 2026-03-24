// KVNamespace shim for non-Cloudflare environments (Node.js / Vercel)
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number; metadata?: any }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

interface Env {
  [key: string]: string | KVNamespace | undefined;
  RUNNING_IN_DOCKER?: string;
  DEFAULT_NUM_CTX?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
  HuggingFace_API_KEY?: string;
  OPEN_ROUTER_API_KEY?: string;
  OLLAMA_API_BASE_URL?: string;
  OPENAI_LIKE_API_KEY?: string;
  OPENAI_LIKE_API_BASE_URL?: string;
  OPENAI_LIKE_API_MODELS?: string;
  TOGETHER_API_KEY?: string;
  TOGETHER_API_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
  LMSTUDIO_API_BASE_URL?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  XAI_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  AWS_BEDROCK_CONFIG?: string;
  CUSTOM_PROVIDERS_KV?: KVNamespace;
}
