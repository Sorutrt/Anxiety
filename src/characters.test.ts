import assert from "node:assert/strict";
import { test } from "node:test";
import { getCharacters, reloadCharacters } from "./characters";

test("all characters define at least one thinking filler", () => {
  reloadCharacters();
  const characters = getCharacters();

  assert.ok(characters.length > 0);
  for (const character of characters) {
    assert.ok(Array.isArray(character.fillerPhrases));
    assert.ok(character.fillerPhrases.length > 0);
    for (const phrase of character.fillerPhrases) {
      assert.equal(typeof phrase, "string");
      assert.ok(phrase.trim().length > 0);
    }
  }
});
