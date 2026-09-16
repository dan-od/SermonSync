**SermonSync**

Product Requirements Document

PRD v3.0 | May 2026 | FINAL

Internal Tool for Foursquare Gospel Church Nigeria

| **For**              | Foursquare Gospel Church Nigeria — All Branches     |
| -------------------- | --------------------------------------------------- |
| **App Type**         | Windows Desktop (Tauri v2) — Offline-First          |
| **AI (Offline)**     | Moonshine Base STT + Algorithmic Scripture Matching |
| **AI (Online)**      | Groq API (free key) for Intelligence Layer          |
| **Bible (Bundled)**  | KJV, ASV, WEB + Yoruba, Hausa, Igbo (public domain) |
| **Bible (Download)** | NIV, NKJV, ESV, AMP, NLT, MSG + 100 more via API    |
| **Price**            | Free Forever — Open Source                          |
| **Author**           | Daniel Okoro — Foursquare Tech Team                 |

# Table of Contents

# 1\. Executive Summary

SermonSync is a free, open-source, offline-first desktop application built exclusively for Foursquare Gospel Church Nigeria. It serves as an AI-powered live production co-pilot that listens to the preacher's audio in real-time, automatically detects Bible verse references, and displays them on the church's projector or TV — with zero internet required for core functionality.

The app is designed to work on the cheapest available hardware (any Windows laptop) with the simplest possible setup (plug in a projector, open the app, start preaching). It replaces the need for a trained media volunteer frantically searching for verses during the sermon.

When a branch has internet access and adds a free Groq API key, the app unlocks an intelligence layer: key point detection, sermon memory across services, auto-generated devotional guides, and improved paraphrase-to-verse matching. But the core scripture detection works fully offline.

Beyond AI detection, the app includes basic presentation features — manual verse search, simple text slides, and a configurable idle screen — so that a brand new church plant can run an entire Sunday service with ONLY this app. For established branches already using EasyWorship, OBS, or ProPresenter, the app can also run as middleware, feeding content via web canvas, green screen, or NDI.

# 2\. Problem Statement

## 2.1 The Pain

Every Sunday across thousands of Foursquare branches in Nigeria, volunteer media teams face the same struggle: the pastor references a Bible verse mid-sermon, and the operator scrambles to type the reference, find the correct version, format it, and display it. During 2-4 hour services, fatigue leads to missed cues, wrong verses, and visible errors on screen.

For new church plants, the problem is worse. They often have no media team at all — just a laptop, a projector, and a pastor. There is no one to operate presentation software, and even if there were, tools like EasyWorship cost money and require training.

## 2.2 Why This Tool

- New Foursquare branches need a zero-cost, zero-training solution that works from day one
- Existing branches need to reduce stress on volunteer media teams
- Nigerian internet is unreliable — the tool MUST work offline
- Hardware budgets are tight — it must run on any Windows laptop, no GPU required
- The denomination needs consistency across branches in how scripture is presented

## 2.3 Why Now

Open-source speech recognition models (Moonshine) have matured to the point where accurate, real-time transcription runs on CPU-only hardware at 50ms latency. Lightweight algorithmic scripture matching can surface verses in microseconds. The technology finally enables an offline-first church AI tool that works on a \$200 laptop.

# 3\. Target Users

| **Persona**                   | **Description**                                                    | **Key Need**                                                                              |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **New Branch Pastor**         | Just planted a church, has a laptop and a projector, no media team | An app that handles scripture display automatically so they can focus on preaching        |
| **Solo Volunteer Operator**   | Church member running slides on Sunday, often untrained            | Simplicity. One-click confirmation instead of manual search. Low stress.                  |
| **Media Director**            | Leads the AV team at an established branch                         | Reliability. Integration with existing tools (OBS, EasyWorship). Reduced training burden. |
| **Foursquare HQ / Tech Team** | Denominational leadership overseeing all branches                  | Standardized tool across branches. Easy distribution. Post-service analytics.             |

# 4\. Product Vision

**VISION STATEMENT**

Every Foursquare branch in Nigeria, from a 10-person church plant in a rented room to a 5,000-seat auditorium, should have an AI co-pilot that turns the pastor's spoken words into beautiful, accurate, real-time scripture display — with zero internet, zero cost, and zero training required.

## 4.1 Core Principles

- Offline-first — Core scripture detection works without internet, period
- Runs on anything — Any Windows laptop, no GPU, no special hardware
- Zero cost — Free forever, open source, no subscriptions
- AI assists, humans approve — Operator confirms before content goes to screen
- Works standalone OR as middleware — Takes over a projector directly, or feeds into OBS/EasyWorship/ProPresenter
- Church-intelligent — Understands Nigerian preaching patterns, Biblical vocabulary, worship/speech switching
- Foursquare-native — Church ID authentication, denominational distribution, standardized across branches

# 5\. MVP Feature Set

## 5.1 AI Scripture Detection (Offline)

- Real-time speech-to-text via Moonshine Base (58MB, runs on CPU, 50ms latency)
- Optional high-quality mode via Whisper for churches with better PCs
- Custom energy-based worship/speech detector — pure Rust math, no model files, detects when singing starts and pauses transcription
- Algorithmic scripture matching: trie-based explicit reference detection ("John 3:16") + keyword index for loose matches
- Verse text pulled from local SQLite Bible database (never needs internet)
- One-click Send / Edit / Dismiss on detected verse cards
- Confidence scoring with configurable auto-send threshold

## 5.2 Online Intelligence Layer (With Free API Key)

- Contextual verse detection — understands "the next verse", "read on", "go back to verse 1", "the verse before that" by tracking which verse is currently displayed and resolving relative references
- Enhanced paraphrase-to-verse matching via Groq LLM (catches what algorithmic matching misses)
- Key point detection — AI identifies repeated themes and suggests main point slides
- Sermon memory — rolling JSON context tracks the full service for 3-4 hours
- Cross-service callbacks — when pastor says "like I said last week," AI searches transcript archive
- Post-service summary generation — auto-generated devotional guide with main points + scriptures
- Smart verse navigation — if the pastor reads through a passage ("verse 2... verse 3... verse 4"), the AI auto-advances without waiting for explicit references

## 5.3 Basic Presentation (Standalone Mode)

- EasyWorship-style display takeover — app detects connected displays, user picks output, app takes full control
- Configurable idle screen — church logo, background image, or custom color when no verse is active
- Manual verse search — type a reference and display it (fallback for when AI misses)
- Simple text slides — operator types a message ("Welcome to Service") and sends to screen
- Display handles any resolution (720p TV to 4K projector), hot-plug support

## 5.4 Middleware Mode (For Established Branches)

- Web canvas on localhost:8080 — add as browser source in OBS or EasyWorship
- Green screen window — chroma key compositing in any video switcher
- NDI Alpha stream — network video for ProPresenter, vMix, OBS with NDI plugin
- All three can run simultaneously alongside standalone mode

## 5.5 Audio Input

- Dropdown lists ALL system audio inputs via CPAL (Rust crate)
- Supports: built-in laptop mic, USB capture card, USB audio interface, line-in from mixing board, virtual audio cable
- Minimum viable setup: laptop's built-in microphone pointed at the speaker
- Best setup: direct audio feed from mixing board via USB interface or capture card
- Audio level meter for visual confirmation that input is working

## 5.6 Bible Version Management

- Bundled offline (public domain, no license needed): KJV, ASV, WEB (World English Bible) in English, plus Yoruba Bible, Hausa Bible, Igbo Bible
- Download additional versions on demand via getBible.net API when internet is available — includes NIV, NKJV, ESV, AMP, NLT, MSG, and 100+ other versions in 50+ languages
- Import custom versions from CSV, JSON, or OSIS XML files — for churches with licensed copies of specific translations
- User picks default display version in settings; AI always pulls verse text from local database
- App is NOT locked down — pastors can add, download, and import any version they want at any time
- Note: copyrighted versions (NIV, NKJV, ESV, AMP, NLT, MSG) cannot be bundled in the installer due to publisher licensing. They are available via download or import.

# 6\. Competitive Landscape

As of mid-2026, exactly two other startups are doing real-time AI scripture detection during live services. Everyone else in church AI is doing sermon preparation (before Sunday) or transcription (after the service). Nobody else is doing live detection.

## 6.1 Direct Competitors

### PewBeam (Nigeria)

Built by Dara Sobaloju, launched March 2026. Fully offline, sub-80ms scripture detection with noise cancellation engineered for Nigerian services. Already in hundreds of churches. Runs on .NET (Windows). Pricing: Free tier (40 min/week) then \$14-30/month. Scripture detection only — no sermon intelligence, no key points, no devotionals, no cross-service memory.

### Loghema / LogosAI (Global)

Desktop app, under-2-second detection. Uses cloud STT (audio streamed to cloud, never stored). Has native ProPresenter, EasyWorship, OpenLP, and NDI integration. Detects four types: direct citations, contextual references ("the next verse"), verbatim quotations, and semantic paraphrases. Has a developer REST + WebSocket API. Supports dual-translation side-by-side display. Scripture detection only — no sermon intelligence layer.

## 6.2 Comparison Matrix

| **Capability**                          | **PewBeam**       | **Loghema**                            | **SermonSync**                  |
| --------------------------------------- | ----------------- | -------------------------------------- | ------------------------------- |
| **AI Scripture Detection**              | Yes               | Yes                                    | Yes                             |
| **Offline Core**                        | Fully offline     | STT needs cloud                        | Fully offline                   |
| **Contextual Detection ("next verse")** | No                | Yes                                    | Yes (intelligence layer)        |
| **Key Point Detection**                 | No                | No                                     | Yes (online)                    |
| **Sermon Memory / Callbacks**           | No                | No                                     | Yes (online)                    |
| **Post-Service Devotionals**            | No                | No                                     | Yes (online)                    |
| **Cross-Service Search**                | No                | No                                     | Yes (online)                    |
| **Standalone Presentation**             | Yes               | No (needs ProPresenter etc.)           | Yes (display takeover)          |
| **Middleware (OBS/ProPresenter)**       | NDI only          | ProPresenter, EasyWorship, NDI, OpenLP | Web canvas + green screen + NDI |
| **Developer API**                       | No                | Yes (REST + WebSocket)                 | Planned Phase 3                 |
| **Dual-Translation Display**            | No                | Yes                                    | Planned Phase 2                 |
| **Price**                               | \$0-30/month      | Unknown (likely paid)                  | Free forever                    |
| **Target Market**                       | Nigerian churches | Global                                 | Foursquare Nigeria (internal)   |
| **Runs on \$200 Laptop**                | Yes               | Yes                                    | Yes                             |

**OUR DIFFERENTIATORS**

1\. Intelligence layer: We are the ONLY tool with key points, sermon memory, callbacks, and auto-devotionals. PewBeam and Loghema both stop at scripture detection.

2\. Free forever: Both competitors charge or will charge. We are an internal denominational tool with zero cost.

3\. Standalone + Middleware: Loghema requires ProPresenter/EasyWorship. PewBeam is standalone only. We do both.

4\. Contextual detection done smarter: Loghema detects "the next verse" — we do that PLUS cross-service callbacks ("like I said last week") via the intelligence layer.

5\. Trusted distribution: Not a random startup — an official Foursquare internal tool.

# 7\. Technical Architecture

## 7.1 System Overview

Single-process desktop app (Tauri v2). Rust backend handles audio capture, speech-to-text, scripture matching, display output, and optional cloud API calls. React/TypeScript frontend provides the operator UI. No separate server process. No Python. No GPU required.

## 7.2 Offline AI Stack

| **Component**             | **Technology**             | **Size**           | **Hardware Need**             |
| ------------------------- | -------------------------- | ------------------ | ----------------------------- |
| **Speech-to-Text**        | Moonshine Base (ONNX)      | 58MB               | CPU only, 50ms latency        |
| **STT (High Quality)**    | Whisper Tiny (whisper.cpp) | 75MB               | CPU, slower (~2-4s per chunk) |
| **Worship/Speech Detect** | Custom energy-based FFT    | 0MB (Rust code)    | CPU, microseconds             |
| **Explicit Verse Match**  | Trie + regex               | 0MB (Rust code)    | CPU, microseconds             |
| **Fuzzy Verse Match**     | Keyword index + scoring    | ~5MB index         | CPU, <10ms                    |
| **Bible Database**        | SQLite                     | ~30MB (4 versions) | Disk only                     |

## 7.3 Online AI Stack (Optional)

| **Component**                 | **Provider** | **Triggered When**                  |
| ----------------------------- | ------------ | ----------------------------------- |
| **Enhanced Paraphrase Match** | Groq LLM     | Algorithmic matcher confidence <70% |
| **Key Point Detection**       | Groq LLM     | Every 60 seconds of transcript      |
| **Callback Detection**        | Groq LLM     | Pastor references earlier content   |
| **Summary Generation**        | Groq LLM     | Session end                         |

## 7.4 Minimum Hardware

| **Spec**           | **Minimum**                               | **Recommended**                                 |
| ------------------ | ----------------------------------------- | ----------------------------------------------- |
| **CPU**            | Any dual-core (Intel i3 / AMD equivalent) | Intel i5 / AMD Ryzen 5                          |
| **RAM**            | 4GB                                       | 8GB                                             |
| **Storage**        | 500MB free (app + models + Bible DB)      | 2GB (for transcript archive)                    |
| **GPU**            | Not required                              | Not required                                    |
| **Display Output** | Any (HDMI, VGA, USB-C, DisplayPort)       | HDMI to projector                               |
| **Audio Input**    | Built-in laptop mic                       | USB audio interface from mixing board           |
| **OS**             | Windows 10 or later                       | Windows 11                                      |
| **Internet**       | Not required for core features            | Needed for intelligence layer + Bible downloads |

# 8\. User Flow

## 8.1 First Launch

1. Install app (download .msi or receive via USB drive)
2. Enter Church ID (provided by Foursquare HQ)
3. Select audio input device from dropdown (test with audio level meter)
4. Select output display (app detects all connected screens)
5. Choose default Bible version (KJV bundled, download others if internet available)
6. Set idle screen (upload church logo or choose background color)
7. Optional: enter free Groq API key to enable intelligence layer (instructions provided in-app)
8. Ready to go

## 8.2 During Service

1. Operator opens app and taps "Start Session"
2. Output display shows idle screen (church logo)
3. Pastor begins preaching; transcript streams in real-time on operator's screen
4. AI detects a verse reference → verse card appears in suggestion panel with confidence score
5. Operator taps Send (or it auto-sends above threshold) → verse displays on projector
6. Operator taps Dismiss when verse should leave the screen → idle screen returns
7. Worship begins → energy detector recognizes music → transcription pauses automatically
8. Preaching resumes → detector switches back to speech mode → transcription resumes
9. Operator can manually search and display a verse at any time
10. Operator can send a simple text slide at any time ("Welcome", "Offering Time", etc.)

## 8.3 Post-Service (Online Mode Only)

1. Operator taps "End Session"
2. AI generates service summary: main points, all cited scriptures, suggested title
3. Devotional guide available for export (PDF or text) to share with congregation
4. Session data saved to local archive for future cross-service callbacks

# 9\. Distribution & Authentication

- App distributed as Windows .msi installer via download link or USB drive
- Each branch authenticates with a Church ID provided by Foursquare HQ
- Church ID is a simple string entered on first launch (no account creation, no email, no password)
- Auto-updater checks for updates when internet is available and installs silently
- For branches with no internet: updated .msi can be distributed via USB drive

# 10\. Release Roadmap

## Phase 1: MVP (Months 1-3)

- Offline scripture detection (Moonshine + algorithmic matching)
- EasyWorship-style display takeover with configurable idle screen
- Manual verse search + simple text slides
- Audio input from any system device
- Bundled Bible versions: KJV, Yoruba, Hausa, Igbo
- Church ID authentication
- Windows installer with auto-updater

## Phase 2: Intelligence Layer (Months 4-6)

- Groq API integration for online features (bring your own key)
- Key point detection + sermon memory
- Cross-service callback detection
- Post-service summary and devotional generation
- Enhanced paraphrase matching via LLM
- Middleware outputs: web canvas, green screen, NDI

## Phase 3: Growth (Months 7-12)

- Song lyrics display (paste lyrics, tap through lines)
- Additional Bible version downloads
- Sermon analytics dashboard (scriptures cited over time, service duration trends)
- Multi-language STT improvements (Pidgin, Yoruba)
- Slide templates and themes
- Mobile companion app for remote monitoring

# 11\. Success Metrics

| **Metric**                   | **Target**                            | **Measurement**                                     |
| ---------------------------- | ------------------------------------- | --------------------------------------------------- |
| **Verse Detection Accuracy** | \>85% offline, >95% online            | Weekly audit: AI suggestions vs actual verses cited |
| **Latency (Offline)**        | <500ms from spoken word to verse card | Built-in timer instrumentation                      |
| **App Stability**            | Zero crashes in 4-hour service        | Crash reporting                                     |
| **Adoption**                 | 100 Foursquare branches in 6 months   | Church ID registrations                             |
| **Setup Time**               | <5 minutes from install to first use  | Onboarding funnel tracking                          |
| **Hardware Compatibility**   | Runs on any PC from 2015 onwards      | Test on low-spec hardware                           |

# 12\. Open Questions

- Should the Church ID system connect to a central Foursquare database for branch management?
- How should Bible versions with copyright restrictions (NIV, ESV) be handled? Import-only?
- Should there be a Foursquare HQ admin dashboard to see which branches are using the tool?
- Should the app eventually support macOS/Linux for branches using non-Windows machines?
- How to handle the edge case of a pastor who speaks over background music during altar calls?

_End of Document – SermonSync PRD v3.0_