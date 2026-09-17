import assert from "node:assert/strict";
import test from "node:test";
import { parseTaskFromText } from "../src/services/task-draft.js";
import { formatTaskMessagePlain } from "../src/services/formatter.js";

const messy = `Вань после техновиля : Екатерина 79623656114
АС Компонент

контрагент прислал черновик электронного поручения по заказу.
https://track.grandproject.ru/issues/33088`;

test("parse messy manager message", () => {
  const d = parseTaskFromText(messy, { defaultWeek: false });
  assert.equal(d.redmineIssueId, 33088);
  assert.ok(d.phones.some((p) => p.includes("9623656114")));
  assert.equal(d.contactName, "Екатерина");
});

test("format good example shape", () => {
  const d = parseTaskFromText(
    `7 сентября - 11 сентября

Техстройсервис ошибка эцп в базе ЗСК

https://track.grandproject.ru/issues/33041
+7 903 269-74-32 Елена`,
    { defaultWeek: false },
  );
  const text = formatTaskMessagePlain(d);
  assert.match(text, /7 сентября - 11 сентября/);
  assert.match(text, /\+7 903 269-74-32 Елена/);
  assert.match(text, /33041/);
});
