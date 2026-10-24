# SermonSync Video Import Architecture

## Overview

For SermonSync, the key is to stop treating **video import** as “open whatever file the user chose.”

A reliable desktop application should have a **media-ingestion pipeline** that normalizes every accepted video into a small set of formats that the playback layer can reliably support.

The recommended architecture is:

```text
ANY USER VIDEO
      ↓
File policy / safety checks
      ↓
Media inspection
      ↓
Compatibility decision
   ↙       ↓        ↘
Direct    Remux    Transcode
   ↘       ↓        ↙
  SermonSync Playback Format
             ↓
      Managed Media Library
             ↓
        Video Player
```

This distinction is what eliminates most codec and container problems.

---

## 1. Define “Supports Any Video” Correctly

You can get very close to arbitrary consumer video support with **FFmpeg** because it supports a very large range of containers and codecs.

`ffprobe` is specifically designed to inspect multimedia streams and return machine-readable information.

However, SermonSync should not promise literal support for every possible media file.

There will always be edge cases such as:

- DRM-protected videos
- encrypted media
- corrupted files
- obscure proprietary codecs
- malformed video files
- codecs not compiled into the FFmpeg build you ship

A better product definition is:

> SermonSync accepts any local video file under 200 MB that its bundled media engine can decode, and automatically converts it into a SermonSync-compatible playback format when necessary.

This is much safer than trusting file extensions such as:

```text
.mp4
.mov
.avi
.mkv
.webm
.wmv
```

An MP4 file is only a **container**.

An MP4 could contain:

- H.264
- H.265 / HEVC
- AV1
- MPEG-4 Part 2
- unusual audio formats
- 10-bit video
- HDR video
- unsupported pixel formats

Therefore, extension alone does not determine whether a video will play smoothly.

---

## 2. Important: File Size Is Not the Same as Playback Difficulty

The requirement that imported files must be below **200 MB** should be treated only as an **import policy**.

It should not be used to decide whether the file will be easy to play.

For example:

```text
File A
190 MB
1080p H.264
8-bit
30fps
```

may play easily on an old laptop.

But:

```text
File B
80 MB
4K AV1
10-bit
60fps
```

may be dramatically harder to decode.

Therefore, SermonSync should evaluate:

- codec
- resolution
- frame rate
- pixel format
- bit depth
- audio codec
- duration
- corruption
- container type

independently from the 200 MB file-size limit.

---

# 3. Recommended Architecture

Use a dedicated `MediaImportService`.

It should be independent of:

- your UI
- your video player
- your presentation engine
- your sermon-recognition engine

Conceptually:

```text
UI
 │
 │ importVideo(path)
 ▼
MediaImportService
 │
 ├── FilePolicy
 ├── MediaProbe
 ├── CompatibilityClassifier
 ├── MediaProcessor
 │     ├── DirectImport
 │     ├── Remux
 │     └── Transcode
 ├── MediaValidator
 └── MediaRepository
          │
          ▼
     Managed Media
          │
          ▼
      PlayerAdapter
```

This separation is important.

Your presentation code should never need to know whether the user originally imported:

```text
sermon.avi
video.mov
clip.mkv
announcement.webm
worship.mp4
old-video.wmv
```

By the time the presentation layer receives the file, it should get something predictable such as:

```text
C:\Users\...\SermonSync\media\ab83d93...\playback.mp4
```

The presentation layer should only need to know:

> This file conforms to SermonSync Playback Profile v1.

That dramatically simplifies everything downstream.

---

# 4. Make the Import Pipeline a State Machine

Each media import should pass through explicit states.

Recommended flow:

```text
SELECTED
   ↓
PROBING
   ↓
CLASSIFIED
   ↓
PROCESSING
   ↓
VALIDATING
   ↓
READY
```

Alternative terminal states:

```text
FAILED
CANCELLED
```

The pipeline itself can be described as:

1. **PRECHECK**
2. **PROBE**
3. **CLASSIFY**
4. **PROCESS**
5. **VALIDATE**
6. **COMMIT**
7. **READY**
8. **FAILED / CANCELLED**

### PRECHECK

Verify:

- file exists
- file is local
- file size is allowed
- basic permissions are valid

### PROBE

Inspect the real media structure using `ffprobe`.

### CLASSIFY

Decide between:

- direct import
- remux
- full transcode

### PROCESS

Copy, remux, or transcode the file.

### VALIDATE

Inspect the resulting media again.

### COMMIT

Atomically move the processed file into the SermonSync media library.

### READY

Make the asset available to the presentation engine.

Persisting these states in your database can also help SermonSync recover gracefully after crashes or restarts.

---

# 5. Perform the 200 MB Check First

Do this before invoking FFmpeg.

Example:

```python
MAX_IMPORT_SIZE = 200 * 1024 * 1024

size = stat(path).size

if size > MAX_IMPORT_SIZE:
    raise MediaImportError(
        code="FILE_TOO_LARGE",
        message="Videos must be 200 MB or smaller."
    )
```

Do **not**:

- read the whole file into RAM
- convert the video to Base64
- load the full video into a JavaScript `Buffer`
- place the complete file in frontend application memory

Use filesystem metadata.

This is especially important because SermonSync is intended to work on low-cost Windows laptops.

---

# 6. Never Trust the File Extension

Do not make decisions like:

```text
.mp4 => supported
.webm => supported
.mov => supported
```

Instead, inspect the actual file using `ffprobe`.

Conceptually:

```bash
ffprobe \
  -v error \
  -show_format \
  -show_streams \
  -of json \
  "input-file"
```

Convert the result into an internal typed structure.

For example:

```typescript
interface MediaDescriptor {
    container: string;

    durationMs: number;
    fileSize: number;

    video: {
        codec: string;
        profile?: string;
        width: number;
        height: number;
        fps: number;
        pixelFormat?: string;
        bitDepth?: number;
        rotation?: number;
    } | null;

    audio: {
        codec: string;
        sampleRate?: number;
        channels?: number;
    } | null;
}
```

From that point onward, the rest of SermonSync should work with the `MediaDescriptor`.

Not the file extension.

---

# 7. Use Three Processing Paths

This is one of the most important architectural decisions.

## Path A — Direct Import

Suppose the input is already:

```text
MP4
H.264
AAC
1920×1080
8-bit
yuv420p
30 fps
```

There is no reason to transcode it.

Transcoding would:

- consume CPU
- take time
- reduce quality
- increase power consumption
- potentially increase file size

Simply copy the video into SermonSync's managed media directory.

---

## Path B — Remux

Suppose the user imports:

```text
video.mkv

Video: H.264
Audio: AAC
```

The video and audio streams are already compatible.

Only the container is undesirable.

You can convert:

```text
MKV
 H.264
 AAC
```

into:

```text
MP4
 H.264
 AAC
```

without re-encoding.

This is called **remuxing** or **stream copying**.

Example:

```bash
ffmpeg \
  -nostdin \
  -i input.mkv \
  -map 0:v:0 \
  -map 0:a:0? \
  -c copy \
  -movflags +faststart \
  output.mp4
```

Using explicit `-map` options is recommended because it gives you deterministic control over which streams are copied.

`+faststart` moves MP4 metadata toward the beginning of the file, improving startup behavior.

Remuxing is usually extremely fast because the video is not being decoded and re-encoded.

---

## Path C — Full Transcode

Suppose the user provides:

```text
MOV
HEVC / H.265
10-bit
3840×2160
60fps
PCM audio
```

Do not pass this directly to the presentation layer.

Convert it once during import.

For example:

```text
MOV / HEVC / 4K60 / 10-bit
              ↓
           FFmpeg
              ↓
MP4 / H.264 / <=1080p / <=30fps / 8-bit
```

Once converted, playback becomes predictable.

---

# 8. Define a SermonSync Playback Profile

For SermonSync, compatibility and low decoding cost matter more than maximum compression efficiency.

A sensible **SermonSync Playback Profile v1** would be:

| Property | SermonSync Playback Profile v1 |
|---|---|
| Container | MP4 |
| Video codec | H.264 / AVC |
| Pixel format | yuv420p |
| Bit depth | 8-bit |
| Maximum resolution | 1920×1080 |
| Frame rate | Source rate capped around 30 fps |
| Audio codec | AAC-LC |
| Audio channels | Stereo |
| Audio sample rate | 48 kHz |
| HDR | Convert to SDR |
| Fast-start | Enabled |
| Multiple video streams | Keep first/default |
| Multiple audio streams | Keep default/first |

The critical properties are:

```text
H.264
8-bit
yuv420p
<=1080p
<=30fps
```

These greatly reduce unexpected decoding requirements.

---

# 9. Separate File-Size Policy from Codec Compatibility

Your classifier should work using media characteristics.

For example:

```typescript
if (
    codec === "h264" &&
    bitDepth <= 8 &&
    pixelFormat === "yuv420p" &&
    width <= 1920 &&
    height <= 1080 &&
    fps <= 30 &&
    audioCodec === "aac"
) {
    return DIRECT;
}

if (
    codec === "h264" &&
    audioCodec === "aac" &&
    otherPlaybackPropertiesAreSafe
) {
    return REMUX;
}

return TRANSCODE;
```

This is much more reliable than:

```typescript
if (size < 200MB)
    playIt();
```

---

# 10. Never Transcode on the Main UI Thread or Process

This is particularly important if SermonSync is built with:

- Electron
- Tauri
- WebView-based desktop architecture
- another GUI framework

Do not do:

```text
Renderer / UI
     ↓
FFmpeg CPU workload
```

Instead:

```text
Renderer
   │
   │ IPC
   ▼
Application backend
   │
   ▼
Import queue
   │
   ▼
Media worker process
   │
   ▼
FFmpeg
```

FFmpeg should ideally run as a separate process.

Benefits include:

```text
FFmpeg crashes
       ↓
worker dies
       ↓
SermonSync stays alive
```

instead of:

```text
decoder failure
    ↓
entire application crashes
```

This also keeps your UI responsive.

---

# 11. Use a Single-Worker Media Queue by Default

For SermonSync, one transcode at a time is a sensible default.

Example:

```text
MediaImportQueue

job 1  PROCESSING
job 2  WAITING
job 3  WAITING
```

Avoid a situation where the laptop is simultaneously doing:

```text
Whisper transcription
+
verse recognition
+
presentation rendering
+
3 FFmpeg encodes
```

All of these would compete for CPU, RAM, and potentially GPU resources.

For SermonSync, the live sermon functionality should have the highest priority.

Consider behavior such as:

```text
if LIVE_SERMON_MODE:
    reduce media worker priority
```

or:

```text
if presentationPerformanceIsCritical:
    pause expensive background conversions
```

A background import should never cause scripture detection or presentation output to stutter.

---

# 12. Treat Hardware Acceleration as an Optimization

Do not make hardware acceleration mandatory.

A bad architecture would assume:

```text
-hwaccel auto
```

solves every machine.

Different Windows laptops may have:

- Intel Quick Sync
- D3D11VA
- DXVA2
- AMD hardware decode
- NVIDIA hardware decode
- outdated drivers
- no usable hardware decoder at all

Your architecture should be:

```text
Software processing = guaranteed fallback

Hardware processing = optional optimization
```

At application startup, you can detect capabilities:

```text
startup
   ↓
capability detection
   ↓
Intel QSV available?
   YES → allow hardware path
   NO  → use software path
```

Do not make Intel QSV, NVIDIA NVENC, or any specific GPU feature mandatory.

SermonSync's goal is to work on almost any Windows laptop.

---

# 13. Separate Playback from Media Ingestion

Your player should be hidden behind an interface.

For example:

```typescript
interface PlayerAdapter {
    load(asset: MediaAsset): Promise<void>;
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    seek(ms: number): void;
    setVolume(value: number): void;
}
```

Then you can implement different playback engines:

```text
MpvPlayerAdapter

WebViewPlayerAdapter

NativePlayerAdapter
```

without changing your media-import architecture.

This is useful because SermonSync may eventually output to:

```text
Projector
OBS
NDI
Web Canvas
Green Screen
```

The media importer should not care which output system is being used.

---

# 14. Consider libmpv for Maximum Playback Reliability

FFmpeg and libmpv can serve different responsibilities:

```text
FFmpeg
    ingestion / conversion

libmpv
    playback
```

mpv is built around FFmpeg and provides a mature playback engine.

On Windows, it can use hardware decoding where available while falling back to software decoding when necessary.

You do not necessarily need libmpv.

If SermonSync already uses Chromium or WebView and all imported media is normalized first, the built-in video element may be sufficient.

However, hiding the implementation behind `PlayerAdapter` lets you replace the playback engine later without redesigning the application.

---

# 15. Bundle FFmpeg with SermonSync

Do not rely on the user's machine already having FFmpeg.

Avoid:

```text
C:\ffmpeg\ffmpeg.exe
```

or:

```text
whatever ffmpeg happens to exist in PATH
```

Instead, ship a known build with SermonSync.

Example:

```text
SermonSync/
    resources/
        media/
            ffmpeg.exe
            ffprobe.exe
```

This gives you:

```text
SermonSync 1.4.0
      ↓
known FFmpeg build
      ↓
known codecs
      ↓
known behavior
```

That makes debugging and support much easier.

---

# 16. Invoke FFmpeg Safely

Do not construct shell commands using user-supplied file paths.

Avoid:

```typescript
exec(`ffmpeg -i "${userPath}" ...`);
```

Instead, invoke the executable directly with an argument array.

For example:

```typescript
spawn(ffmpegPath, [
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    ...
]);
```

This avoids shell-injection problems and strange behavior caused by characters such as:

```text
&
|
"
'
;
```

For example, a normal church filename could be:

```text
Praise & Worship (Sunday).mp4
```

Using argument arrays ensures the filename is handled correctly.

---

# 17. Restrict FFmpeg Input Protocols

SermonSync is offline-first.

A local media importer should not unexpectedly access remote resources.

FFmpeg can work with many network protocols, so your importer should deliberately restrict what is allowed.

Conceptually:

```text
Allowed:

file
pipe when necessary

Not automatically allowed:

http
https
ftp
rtmp
...
```

If you later support network streams, implement them through a separate module.

Do not mix local-file importing with network-stream support.

---

# 18. Never Overwrite the User's Original Video

Use a safe transactional flow:

```text
original file
     ↓
temporary processing file
     ↓
validation
     ↓
atomic rename
     ↓
media library
```

Example structure:

```text
AppData/
  SermonSync/
    media/
       temp/
          73839.tmp.mp4

       assets/
          8ae79d7/
              playback.mp4
              metadata.json
              thumbnail.jpg
```

Only after conversion succeeds should:

```text
temp/73839.tmp.mp4
```

be renamed to:

```text
assets/8ae79d7/playback.mp4
```

If FFmpeg crashes halfway through, SermonSync is left only with a temporary file that can safely be deleted.

The application's media database should never reference a half-written asset.

---

# 19. Use Content Hashes for Duplicate Detection

Calculate a cryptographic hash such as SHA-256 while importing or copying the file.

For example:

```text
church-logo-video.mp4
Sunday intro.mp4
Copy of Sunday intro.mp4
```

may all resolve to:

```text
SHA256:
4cb7507d...
```

SermonSync can then store only one media asset.

A cache key can include the playback-profile version:

```text
hash(
    sourceSHA256 +
    "sermonsync-playback-v1"
)
```

If SermonSync later introduces:

```text
SermonSync Playback v2
```

the application can determine exactly which assets need regeneration.

---

# 20. Do Not Assume the Converted File Will Still Be Under 200 MB

The 200 MB limit applies to imports.

It does not guarantee the converted output will remain below 200 MB.

For example:

```text
input:
2 hours
HEVC
190 MB
```

could become:

```text
500 MB
1 GB
2 GB
```

after H.264 conversion, depending on your encoder settings.

Therefore, you need two separate policies:

```text
Import limit
200 MB

Media cache/storage policy
separate concern
```

You may decide to impose target bitrates.

For example:

```text
1080p → approximately 3–5 Mbps

720p → approximately 1.5–3 Mbps
```

Do not blindly preserve the source bitrate.

---

# 21. Use FFmpeg's Machine-Readable Progress Interface

Avoid parsing human-readable console output such as:

```text
frame=...
fps=...
time=...
```

Instead, use FFmpeg's program-friendly progress interface.

For example:

```bash
-progress pipe:1
```

Your worker can then process structured `key=value` information.

Architecture:

```text
FFmpeg
  ↓
progress pipe
  ↓
ImportWorker
  ↓
IPC
  ↓
UI

"Importing video — 43%"
```

This is much more robust than regular-expression parsing of stderr.

---

# 22. Define Proper Error Categories

Do not expose raw process errors such as:

```text
Process exited with code -1073741819
```

to church operators.

Internally define clear error codes.

For example:

```text
FILE_TOO_LARGE
FILE_NOT_FOUND
NOT_A_VIDEO
PROBE_FAILED
CORRUPT_MEDIA
UNSUPPORTED_CODEC
DRM_OR_ENCRYPTED
TRANSCODE_FAILED
DISK_FULL
IMPORT_CANCELLED
OUTPUT_VALIDATION_FAILED
```

Translate them into friendly UI messages.

For example:

```text
This video could not be read.

It may be damaged or use an unsupported/protected format.
Try exporting it again from the original application.
```

You can still expose FFmpeg logs under something like:

```text
View technical details
```

This makes debugging and support significantly easier.

---

# 23. Validate the Generated File

Do not assume a successful FFmpeg exit code is enough.

Run `ffprobe` again on the processed output.

Verify things such as:

```text
video stream exists
codec = h264
width <= 1920
height <= 1080
pixel format = yuv420p
audio = AAC if audio exists
duration is reasonable
file size > 0
```

Only then set the asset state to:

```text
READY
```

This protects the application against edge cases where a conversion completes but produces a file that does not match the SermonSync playback contract.

---

# 24. Preload Videos Before Showing Them

During a live church service, avoid this sequence:

```text
operator clicks Play
      ↓
load file
      ↓
initialize decoder
      ↓
create renderer
      ↓
show frame
```

Instead:

```text
operator selects video
      ↓
player loads hidden
      ↓
decoder initialized
      ↓
first frames buffered
      ↓
READY
```

Then playback becomes:

```text
Play
 ↓
show immediately
```

This matters in live production because even a one-second black screen can feel very noticeable.

---

# 25. Recommended Overall SermonSync Media Architecture

A strong long-term architecture would look like this:

```text
                         ┌─────────────────────┐
                         │      SermonSync     │
                         └──────────┬──────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
               ▼                    ▼                    ▼
        Sermon Engine       Presentation Engine     Media Engine
               │                    │                    │
         speech / Bible         verses/slides         imports
               │                    │                    │
               │                    │              ┌─────┴──────┐
               │                    │              │MediaImport │
               │                    │              └─────┬──────┘
               │                    │                    │
               │                    │              ┌─────▼──────┐
               │                    │              │ ffprobe    │
               │                    │              └─────┬──────┘
               │                    │                    │
               │                    │          ┌─────────┼─────────┐
               │                    │          ▼         ▼         ▼
               │                    │       Direct     Remux   Transcode
               │                    │          └─────────┼─────────┘
               │                    │                    │
               │                    │              ┌─────▼──────┐
               │                    │              │Media Store │
               │                    │              └─────┬──────┘
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    │
                              ┌─────▼──────┐
                              │PlayerAdapter│
                              └─────┬──────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
           Projector               OBS                  NDI/Web
```

That separation becomes increasingly valuable as SermonSync grows.

---

# 26. FFmpeg Licensing Considerations

Because SermonSync distributes its own media engine, FFmpeg licensing should be considered deliberately.

FFmpeg is primarily licensed under the LGPL, but certain optional components can cause a particular FFmpeg build to fall under GPL requirements.

This especially matters if you ship components such as `libx264`.

Because SermonSync is open source, GPL compatibility may be acceptable depending on the license chosen for the project.

However, you should intentionally select and document the FFmpeg build that you distribute rather than downloading an arbitrary binary.

---

# 27. Recommended User Experience

The architecture should remain invisible to the church operator.

From the user's perspective:

```text
User clicks "Add Video"
        │
        ▼
Selects anything ≤ 200 MB
        │
        ▼
SermonSync analyzes it
        │
        ├── already suitable ──────► instant import
        │
        ├── container unsuitable ──► very fast remux
        │
        └── codec unsuitable ──────► one-time conversion
                                      │
                                      ▼
                               SermonSync format
                                      │
                                      ▼
                                    Ready
```

The user does not need to understand:

- codecs
- pixel formats
- containers
- audio streams
- FFmpeg
- video profiles
- hardware acceleration

SermonSync handles those internally.

---

# 28. Final Recommended Design Principle

The main architectural principle should be:

> **Accept broadly at the edge, normalize aggressively at the boundary, and keep the core of the application narrow and predictable.**

For SermonSync, the recommended solution is to:

- use **FFmpeg / ffprobe** as the ingestion engine
- enforce a **200 MB import-policy limit**
- inspect real media metadata instead of trusting extensions
- maintain a **single canonical playback profile**
- use **direct copy** when media already conforms
- use **remuxing** when only the container needs changing
- use **transcoding** only when necessary
- perform expensive work in a **separate single-worker queue**
- keep software decoding/encoding as a **guaranteed fallback**
- treat hardware acceleration as an optional optimization
- store processed media in a **managed local media cache**
- validate every processed output before declaring it ready
- keep media ingestion separate from playback
- expose playback through a `PlayerAdapter`
- bundle a known FFmpeg/ffprobe build with SermonSync
- never overwrite the user's original media
- use content hashes for duplicate detection
- preload media before presentation
- prioritize live sermon processing over background media conversion

The resulting experience should allow a church user to import common files such as:

```text
AVI
MOV
MKV
MP4
WMV
WebM
```

while the rest of SermonSync sees only one predictable form:

```text
SermonSync-compatible media
```

That is the most reliable way to make video importing feel universal while keeping playback smooth on inexpensive Windows hardware.

---

## References

- FFmpeg Documentation: <https://ffmpeg.org/documentation.html>
- FFmpeg CLI Documentation: <https://ffmpeg.org/ffmpeg.html>
- ffprobe Documentation: <https://ffmpeg.org/ffprobe.html>
- FFmpeg Protocol Documentation: <https://ffmpeg.org/ffmpeg-protocols.html>
- FFmpeg Legal / Licensing Information: <https://ffmpeg.org/legal.html>
- mpv Manual: <https://mpv.io/manual/stable/>
