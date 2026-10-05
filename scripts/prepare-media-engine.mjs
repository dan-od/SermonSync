// Stage a pinned, verified LGPL FFmpeg build before Tauri packages the app.
// The archive stays outside the repository; only the two runtime executables
// and build provenance are copied into the bundle.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const release = "autobuild-2026-09-30-13-08";
const variants = {
  linux: {
    filename: "ffmpeg-n8.1.3-9-g29e619e767-linux64-lgpl-8.1.tar.xz",
    sha256: "dfa863a00ca81f1bdf58a372b18cff4820f0017e55de32778de8ecd8ed92a02e",
  },
  win32: {
    filename: "ffmpeg-n8.1.3-9-g29e619e767-win64-lgpl-8.1.zip",
    sha256: "4a7642b2264c03e8a0ce8a3825b933ee5580656f45695a086fe7e294045ffc0a",
  },
};
const variant = variants[process.platform];
if (!variant || process.arch !== "x64") {
  throw new Error("Media engine packaging currently supports x64 Windows and Linux.");
}
const output = resolve("src-tauri/resources/media-engine");
const extension = process.platform === "win32" ? ".exe" : "";
const provenance = join(output, "BUILD.txt");
const sourceUrl = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${release}/${variant.filename}`;

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const digest = createHash("sha256");
    const source = createReadStream(path);
    source.on("data", (chunk) => digest.update(chunk));
    source.on("error", reject);
    source.on("end", () => resolveHash(digest.digest("hex")));
  });
}

function command(binary, args) {
  return execFileSync(binary, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

function verify() {
  const ffmpeg = join(output, `ffmpeg${extension}`);
  const ffprobe = join(output, `ffprobe${extension}`);
  const build = command(ffmpeg, ["-buildconf"]);
  const version = command(ffmpeg, ["-version"]);
  const probeVersion = command(ffprobe, ["-version"]);
  if (!version.includes("29e619e767") || !probeVersion.includes("29e619e767")) {
    throw new Error("Bundled FFmpeg and ffprobe do not match the pinned build.");
  }
  if (build.includes("--enable-gpl") || build.includes("--enable-nonfree") || !build.includes("--enable-libopenh264")) {
    throw new Error("Media engine must be an LGPL build with OpenH264 and no GPL/nonfree components.");
  }
  const encoders = command(ffmpeg, ["-encoders"]);
  const filters = command(ffmpeg, ["-filters"]);
  if (!encoders.includes("libopenh264") || !filters.includes("zscale") || !filters.includes("tonemap")) {
    throw new Error("Media engine lacks an encoder or filter required by the playback profile.");
  }
  return `${version}\n${build}`;
}

async function downloadArchive(path) {
  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Could not download media engine (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  const digest = await sha256(path);
  if (digest !== variant.sha256) throw new Error(`Media engine archive checksum mismatch: ${digest}`);
}

function extract(archive) {
  const script = `
import os, sys, tarfile, zipfile, shutil
archive, destination, suffix = sys.argv[1:]
members = {}
if archive.endswith(".zip"):
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            base = name.replace("\\\\", "/").rsplit("/", 1)[-1]
            if base in ("ffmpeg" + suffix, "ffprobe" + suffix):
                members[base] = source.read(name)
else:
    with tarfile.open(archive, "r:xz") as source:
        for member in source.getmembers():
            base = member.name.rsplit("/", 1)[-1]
            if base in ("ffmpeg" + suffix, "ffprobe" + suffix):
                handle = source.extractfile(member)
                if handle: members[base] = handle.read()
if len(members) != 2: raise SystemExit("Archive is missing FFmpeg or ffprobe")
for name, payload in members.items():
    with open(os.path.join(destination, name), "wb") as target: target.write(payload)
`;
  const candidates = process.platform === "win32" ? [["py", "-3"], ["python", ""]] : [["python3", ""]];
  let result;
  for (const [binary, prefix] of candidates) {
    result = spawnSync(binary, [...(prefix ? [prefix] : []), "-c", script, archive, output, extension], { encoding: "utf8" });
    if (!result.error) break;
  }
  if (result?.error || result?.status !== 0) throw new Error(result?.stderr || result?.error?.message || "Could not extract media engine.");
}

await mkdir(output, { recursive: true });
let current = false;
try { current = (await readFile(provenance, "utf8")).includes(variant.sha256); } catch { /* Build has not been staged. */ }
if (current) {
  try { verify(); process.exit(0); } catch { /* Re-stage a damaged or mismatched build. */ }
}
const archive = join(tmpdir(), `sermonsync-${variant.filename}`);
try {
  let cached = false;
  try { cached = (await sha256(archive)) === variant.sha256; } catch { /* Download below. */ }
  if (!cached) await downloadArchive(archive);
  extract(archive);
  if (process.platform !== "win32") {
    await chmod(join(output, "ffmpeg"), 0o755);
    await chmod(join(output, "ffprobe"), 0o755);
  }
  const details = verify();
  await writeFile(provenance, [
    "SermonSync bundled LGPL media engine",
    `Archive: ${sourceUrl}`,
    `SHA-256: ${variant.sha256}`,
    "Build scripts and corresponding source: https://github.com/BtbN/FFmpeg-Builds/tree/autobuild-2026-09-30-13-08",
    "FFmpeg licensing and source: https://ffmpeg.org/legal.html",
    "",
    details,
  ].join("\n"));
  process.stdout.write("Verified LGPL FFmpeg media engine for SermonSync.\n");
} catch (error) {
  for (const name of [`ffmpeg${extension}`, `ffprobe${extension}`, "BUILD.txt"]) {
    await rm(join(output, name), { force: true });
  }
  throw error;
}
