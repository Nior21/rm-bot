import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPhoneForTelegram,
  normalizePhoneE164,
  correctPhoneTypo,
} from "../src/services/phone.js";

test("normalize RU phones", () => {
  assert.equal(normalizePhoneE164("79623656114"), "+79623656114");
  assert.equal(normalizePhoneE164("8 903 269-74-32"), "+79032697432");
});

test("telegram display format", () => {
  assert.equal(formatPhoneForTelegram("+79032697432"), "+7 903 269-74-32");
});

test("typo correction", () => {
  const c = correctPhoneTypo("+79032697433", ["+79032697432"]);
  assert.ok(c?.corrected);
  assert.equal(c?.phone, "+79032697432");
});
