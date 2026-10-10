import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import {
  downloadImage,
  imageSourceUrl,
  publicAddress,
  resolveImageAddress,
} from "../src/lib/remote-image";
import { ImageError, MAX_IMAGE_SOURCE_BYTES } from "../src/lib/images";
const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

test("image sources reject local/private/mapped/metadata addresses and unsafe URL schemes", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.113",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "3fff::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("93.184.216.34"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "http://example.com/a.png",
    "file:///etc/passwd",
    "sandbox:/mnt/data/a.png",
    "https://user:pass@example.com/a",
    "https://example.com:444/a",
    "https://example.com/a#fragment",
  ])
    assert.throws(() => imageSourceUrl(url), ImageError);
  await assert.rejects(resolveImageAddress(new URL("https://2130706433/a.png")), ImageError);
  await assert.rejects(
    resolveImageAddress(new URL("https://[::ffff:127.0.0.1]/a.png")),
    ImageError,
  );
  await assert.rejects(
    resolveImageAddress(new URL("https://example.com/a.png"), async () => [
      ...(await publicResolver()),
      { address: "10.0.0.1", family: 4 },
    ]),
    ImageError,
  );
});
test("downloads use validated addresses and validate every redirect before requesting it", async () => {
  const seen: string[] = [];
  const bytes = Buffer.from("raster bytes validated by image decoder afterwards");
  const result = await downloadImage("https://example.com/start", {
    resolve: publicResolver,
    fetch: async (url, address) => {
      assert.equal(address.address, "93.184.216.34");
      seen.push(url.pathname);
      return url.pathname === "/start"
        ? { status: 302, headers: { location: "/image.png" }, body: Readable.from([]) }
        : { status: 200, headers: { "content-type": "image/png" }, body: Readable.from([bytes]) };
    },
  });
  assert.deepEqual(result, bytes);
  assert.deepEqual(seen, ["/start", "/image.png"]);
  let requests = 0;
  await assert.rejects(
    downloadImage("https://example.com/start", {
      resolve: publicResolver,
      fetch: async () => {
        requests++;
        return {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
          body: Readable.from([]),
        };
      },
    }),
    ImageError,
  );
  assert.equal(requests, 1, "Private redirect is rejected before making a second request");
});
test("stream limits, response types, redirect limits and timeouts are enforced", async () => {
  await assert.rejects(
    downloadImage("https://example.com/a", {
      resolve: publicResolver,
      fetch: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        body: Readable.from(["login page"]),
      }),
    }),
    ImageError,
  );
  await assert.rejects(
    downloadImage("https://example.com/a", {
      resolve: publicResolver,
      fetch: async () => ({
        status: 200,
        headers: {},
        body: Readable.from([Buffer.alloc(MAX_IMAGE_SOURCE_BYTES), Buffer.alloc(1)]),
      }),
    }),
    (e: unknown) => e instanceof ImageError && e.status === 413,
  );
  await assert.rejects(
    downloadImage("https://example.com/a", {
      resolve: publicResolver,
      fetch: async () => ({
        status: 200,
        headers: { "content-length": String(MAX_IMAGE_SOURCE_BYTES + 1) },
        body: Readable.from([]),
      }),
    }),
    ImageError,
  );
  let redirects = 0;
  await assert.rejects(
    downloadImage("https://example.com/a", {
      resolve: publicResolver,
      fetch: async () => {
        redirects++;
        return { status: 302, headers: { location: "/loop" }, body: Readable.from([]) };
      },
    }),
    ImageError,
  );
  assert.equal(redirects, 4);
  const signed = "https://example.com/image.png?secret=do-not-log-this";
  await assert.rejects(
    downloadImage(signed, {
      timeoutMs: 10,
      resolve: async () => {
        await delay(30);
        return publicResolver();
      },
    }),
    (e: unknown) => e instanceof ImageError && !e.message.includes("do-not-log-this"),
  );
  await assert.rejects(
    downloadImage(signed, {
      timeoutMs: 10,
      resolve: publicResolver,
      fetch: async () => ({
        status: 200,
        headers: {},
        body: Readable.from(
          (async function* () {
            await delay(30);
            yield Buffer.from("slow");
          })(),
        ),
      }),
    }),
    ImageError,
  );
});
