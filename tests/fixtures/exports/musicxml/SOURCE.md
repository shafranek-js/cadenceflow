# MusicXML 4.0 schema cache

This directory contains the official MusicXML 4.0 XSD dependency set retrieved
on 2026-09-07 from the [W3C MusicXML 4.0 specification](https://www.w3.org/2021/06/musicxml40/)
and the [official MusicXML 4.0 release archive](https://github.com/w3c-cg/musicxml/releases/download/v4.0/musicxml-4.0.zip).

Cached files and SHA-256 hashes:

| File                  | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `schema/musicxml.xsd` | `bfe37ed25a9ec00e6f2591d53df260b84efe12aed209ba3ac0a76f9287665a99` |
| `schema/xlink.xsd`    | `6e601f8eeb41618b50e4c7f944dff754e57ea43b602755470dda24c9c2f6df92` |
| `schema/xml.xsd`      | `616a3077df5cfc954ac74a75abe9697b95eef7a85dbe09367d995a483e840eb5` |
| `schema/catalog.xml`  | `c65df54cbf1c6bd73a335d47c0ec292c4c1d7ecca20dbb6e36388bb169c71245` |

The files are the unmodified official schema/catalog files. The MusicXML
specification is copyright © 2004–2021 the Contributors to the MusicXML
Specification and is published by the W3C Music Notation Community Group under
the [W3C Community Final Specification Agreement (FSA)](https://www.w3.org/community/about/agreements/final/).

`scripts/validate-musicxml.ts` uses `libxmljs2@0.37.0` for actual local XSD
validation. The catalog resolves the schema imports to this cache, and
network access is disabled for validation. Both the valid and invalid fixture
checks therefore run deterministically offline.
