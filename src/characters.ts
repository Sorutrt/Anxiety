import fs from "fs";
import path from "path";
import { CharacterDefinition } from "./types";

const charactersPath = path.resolve(process.cwd(), "data", "characters.json");
let cachedCharacters: CharacterDefinition[] | null = null;

function readCharacters(): CharacterDefinition[] {
  try {
    const raw = fs.readFileSync(charactersPath, "utf-8");
    const parsed = JSON.parse(raw) as CharacterDefinition[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
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
