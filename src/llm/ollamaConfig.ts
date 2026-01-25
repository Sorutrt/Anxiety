import path from "path";

const OLLAMA_ROOT_DIR = path.resolve(process.cwd(), "tools", "ollama");

// Ollamaの実行ファイルと保存先をリポジトリ配下に固定する。
export const OLLAMA_BIN_PATH = path.resolve(OLLAMA_ROOT_DIR, "ollama.exe");
export const OLLAMA_MODELS_DIR = path.resolve(OLLAMA_ROOT_DIR, "models");
export const OLLAMA_TMP_DIR = path.resolve(OLLAMA_ROOT_DIR, "tmp");
export const OLLAMA_API_BASE_URL = "http://127.0.0.1:11434";
export const OLLAMA_HOST = "127.0.0.1:11434";
