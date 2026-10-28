import assert from "node:assert/strict";
import test from "node:test";

import { installAndroidBackHandler } from "../src/mobile/native-back.ts";

function createFakeApp() {
  let handler;
  let exits = 0;
  let removals = 0;

  return {
    app: {
      async addListener(eventName, callback) {
        assert.equal(eventName, "backButton");
        handler = callback;
        return {
          async remove() {
            removals += 1;
          },
        };
      },
      async exitApp() {
        exits += 1;
      },
    },
    pressBack() {
      handler?.();
    },
    counts() {
      return { exits, removals };
    },
  };
}

test("Android back pops an open in-app screen before exiting", async () => {
  const fake = createFakeApp();
  let canPop = true;
  let pops = 0;
  const remove = installAndroidBackHandler({
    app: fake.app,
    platform: "android",
    canPop: () => canPop,
    pop: () => {
      pops += 1;
    },
  });

  await Promise.resolve();
  fake.pressBack();
  assert.equal(pops, 1);
  assert.equal(fake.counts().exits, 0);

  canPop = false;
  fake.pressBack();
  assert.equal(pops, 1);
  assert.equal(fake.counts().exits, 1);

  await remove();
  assert.equal(fake.counts().removals, 1);
});

test("non-Android platforms do not register a back handler", async () => {
  let registrations = 0;
  const remove = installAndroidBackHandler({
    app: {
      async addListener() {
        registrations += 1;
        return { async remove() {} };
      },
      async exitApp() {},
    },
    platform: "web",
    canPop: () => false,
    pop() {},
  });

  await remove();
  assert.equal(registrations, 0);
});

test("an unavailable native App plugin degrades without an unhandled rejection", async () => {
  const remove = installAndroidBackHandler({
    app: {
      async addListener() {
        throw new Error("App plugin unavailable");
      },
      async exitApp() {},
    },
    platform: "android",
    canPop: () => false,
    pop() {},
  });

  await assert.doesNotReject(remove());
});
