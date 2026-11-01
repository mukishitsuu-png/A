// メインBot / その他Bot（クラウド / エージェント層）
export function createBots(sendToAgent) {
  const toMac = (task) => sendToAgent('local-mac', task);
  return {
    // メインBot: 依頼をそのまま常駐Macへ
    main: ({ text, repo, base, keep, device }) =>
      toMac({ repo, prompt: text, base, keep, device }),

    // カメラ自作Bot
    camera: ({ text, repo = 'camera', ...o }) =>
      toMac({ ...o, repo, prompt: `[カメラ自作プロジェクト] ${text}` }),

    // 日報Bot
    report: ({ text = '', repo, ...o }) =>
      toMac({
        ...o, repo,
        prompt: `今日(${new Date().toISOString().slice(0, 10)})のgitコミットと変更内容から日報をMarkdownで作成して。ファイルは変更しないこと。${text}`,
      }),
  };
}
