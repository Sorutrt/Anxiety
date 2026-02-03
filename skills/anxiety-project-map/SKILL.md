---
name: anxiety-project-map
description: このリポジトリで機能追加・修正を行う際に、どのファイルを触るべきかを素早く特定し、STT→LLM→A.I.VOICE のデータフロー/プロトコルを確認するためのガイド。STT/LLM/TTS、コマンド追加、デプロイ登録、設定やキャラクター定義を触るときに使う。
---

# Anxiety Project Map

## 概要

このプロジェクトの機能とファイルの対応表、および STT→LLM→A.I.VOICE の接続プロトコルをまとめて参照する。

## 使い方

- 目的の機能に対応するファイルを探すときは `references/file-map.md` を参照する。
- STT→LLM→A.I.VOICE の流れや状態遷移を確認したいときは `references/protocols.md` を参照する。
- openai-whisper の詳細変更は既存の `skills/openai-whisper/` を優先して参照する。

## 参照ファイル

- `references/file-map.md`: 機能とファイルの対応表（どこを触るか）
- `references/protocols.md`: STT→LLM→A.I.VOICE のプロトコルと状態遷移
