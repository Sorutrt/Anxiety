import fs from "fs";
import path from "path";
import { CharacterDefinition } from "./types";

const charactersPath = path.resolve(process.cwd(), "data", "characters.json");
let cachedCharacters: CharacterDefinition[] | null = null;

function normalizeCharacter(value: unknown): CharacterDefinition | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.displayName !== "string" ||
    typeof raw.systemPrompt !== "string" ||
    typeof raw.speakingStyle !== "string" ||
    typeof raw.voicePreset !== "string"
  ) {
    return null;
  }

  const fillerPhrases = Array.isArray(raw.fillerPhrases)
    ? raw.fillerPhrases.filter((phrase): phrase is string => typeof phrase === "string")
    : [];
  const openrouterParams =
    raw.openrouterParams && typeof raw.openrouterParams === "object"
      ? raw.openrouterParams
      : undefined;

  return {
    id: raw.id,
    displayName: raw.displayName,
    systemPrompt: raw.systemPrompt,
    speakingStyle: raw.speakingStyle,
    fillerPhrases,
    openrouterParams: openrouterParams as CharacterDefinition["openrouterParams"],
    voicePreset: raw.voicePreset,
  };
}

function readCharacters(): CharacterDefinition[] {
  try {
    const raw = fs.readFileSync(charactersPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((character) => normalizeCharacter(character))
      .filter((character): character is CharacterDefinition => character !== null);
  } catch {
    return [];
  }
}

export function getCharacters(): CharacterDefinition[] {
  if (cachedCharacters === null) {
    cachedCharacters = readCharacters();
  }
  return cachedCharacters;
}

export function findCharacter(value: string): CharacterDefinition | undefined {
  const normalized = value.trim().toLowerCase();
  return getCharacters().find(
    (character) =>
      character.id.toLowerCase() === normalized ||
      character.displayName.toLowerCase() === normalized
  );
}

export function reloadCharacters(): void {
  cachedCharacters = readCharacters();
}
