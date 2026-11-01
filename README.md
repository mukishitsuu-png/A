# Grok Bot

ユーザー → Grok Bot(クラウド) → 常駐MacのGrok Botアプリ → Orca(worktree) → Codex

```
cloud/server.js         HTTP API + 登録端末WS (/devices/connect)
cloud/bots.js           メインBot / その他Bot(camera, report) → SendToAgent
cloud/localMacAgent.js  ローカルMac bot（常駐Mac専用エージェント）
mac/app.js              常駐Mac上のGrok Botアプリ（自動再接続）
mac/orca.js             worktree create → codex → commit → 片付け
mac/codex.js            codex exec 実行
```

## セットアップ
```sh
npm i && cp .env.example .env   # 値を編集
# クラウド
set -a; . ./.env; npm run cloud
# 常駐Mac（launchd 常駐）
cp mac/com.grokbot.mac.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.grokbot.mac.plist
```

## API（`Authorization: Bearer $API_TOKEN`）
| | |
|---|---|
| `POST /bots/{main\|camera\|report}/messages[?wait=true]` | `{text, repo, base?, keep?, device?}` |
| `GET /jobs/:id` | 結果: `{output, branch, diffStat, worktree}` |
| `GET /devices` | 接続中の常駐Mac |

```sh
curl -XPOST "$URL/bots/main/messages?wait=true" -H "Authorization: Bearer $API_TOKEN" \
  -d '{"text":"READMEを整理して","repo":"myapp"}'
```

- `repo` は Mac 側 `REPOS` の許可リストのみ
- 変更は `orca/<id>` ブランチにコミット（変更なしなら削除）
