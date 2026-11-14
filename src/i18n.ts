import type { Language } from "@sculptr/sdk";

export interface Text {
  status: {
    unsupported: string;
    noChannel: string;
    joining: (channel: string) => string;
    listening: (channel: string) => string;
    reconnecting: string;
    offline: string;
    forGame: string;
  };
  waiting: {
    idle: string;
    forGame: string;
    closes: (seconds: number) => string;
    next: (minutes: number, seconds: number) => string;
  };
  channel: string;
  channelPlaceholder: string;
  channelHint: string;
  channelBad: string;
  channelOk: (login: string) => string;
  round: string;
  askNow: string;
  nobodyFollowing: string;
  kick: (name: string) => string;
  botTranslate: string;
  /**
   * What the bot posts in the channel.
   *
   * Apart from everything else here, which only the player reads: these are read by the channel,
   * and `botTranslate` is the player saying whether the channel reads what they read. `answer` is
   * already a number over a number, so it is the same in every language.
   */
  bot: {
    rating: string;
    difficulty: string;
    ask: (
      what: string,
      max: number,
      title: string,
      creator: string | null,
      seconds: number,
    ) => string;
    nobody: (title: string, answer: string) => string;
    won: (name: string, guess: number, answer: string) => string;
    kicked: (name: string) => string;
  };
}

const pad = (value: number): string => String(value).padStart(2, "0");

const en: Text = {
  status: {
    unsupported: "Not supported",
    noChannel: "No channel set",
    joining: (channel) => `Joining #${channel}...`,
    listening: (channel) => `Listening to #${channel}`,
    reconnecting: "Reconnecting...",
    offline: "Not connected",
    forGame: "Waiting for the game",
  },
  waiting: {
    idle: "Not asking",
    forGame: "Waiting for the game",
    closes: (seconds) => `Answers close in ${seconds}s`,
    next: (minutes, seconds) =>
      minutes > 0
        ? `Next question in ${minutes}m ${pad(seconds)}s`
        : `Next question in ${seconds}s`,
  },
  channel: "Channel",
  channelPlaceholder: "your twitch login",
  channelHint: "Chat plays along in this channel.",
  channelBad: "That is not a channel name.",
  channelOk: (login) => `Listening as #${login}`,
  round: "Round",
  askNow: "Ask now",
  nobodyFollowing: "Nobody following",
  kick: (name) => `Kick ${name}`,
  botTranslate: "Bot speaks your language",
  bot: {
    rating: "RATING",
    difficulty: "DIFFICULTY",
    ask: (what, max, title, creator, seconds) =>
      `Guess the ${what} (0-${max}) of "${title}"${creator ? ` by ${creator}` : ""}. ` +
      `Closest guess in ${seconds} seconds wins!`,
    nobody: (title, answer) => `Nobody guessed! "${title}" is ${answer}.`,
    won: (name, guess, answer) =>
      `${name} wins with ${guess}, and it's ${answer}! You're following the runner now: ` +
      `say "!text hello" and it shows up in the game.`,
    kicked: (name) => `${name} is no longer following the runner.`,
  },
};

const TEXT: Record<Language, Text> = {
  en,
  "zh-CN": {
    status: {
      unsupported: "不支持",
      noChannel: "未设置频道",
      joining: (channel) => `正在加入 #${channel}…`,
      listening: (channel) => `正在收听 #${channel}`,
      reconnecting: "正在重连…",
      offline: "未连接",
      forGame: "等待游戏",
    },
    waiting: {
      idle: "暂不提问",
      forGame: "等待游戏",
      closes: (seconds) => `${seconds} 秒后截止回答`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `下一题将在 ${minutes} 分 ${pad(seconds)} 秒后`
          : `下一题将在 ${seconds} 秒后`,
    },
    channel: "频道",
    channelPlaceholder: "你的 Twitch 用户名",
    channelHint: "这个频道的观众会一起玩。",
    channelBad: "这不是频道名。",
    channelOk: (login) => `将收听 #${login}`,
    round: "回合",
    askNow: "立即提问",
    nobodyFollowing: "无人跟随",
    kick: (name) => `踢出 ${name}`,
    botTranslate: "机器人使用你的语言",
    bot: {
      rating: "评分",
      difficulty: "难度",
      ask: (what, max, title, creator, seconds) =>
        `猜猜《${title}》${creator ? `（作者 ${creator}）` : ""}的${what}（0-${max}），` +
        `${seconds} 秒内最接近的人获胜！`,
      nobody: (title, answer) => `没有人猜中！《${title}》是 ${answer}。`,
      won: (name, guess, answer) =>
        `${name} 猜 ${guess} 获胜，答案是 ${answer}！现在你跟着跑者了，` +
        `发送 "!text hello" 就会显示在游戏里。`,
      kicked: (name) => `${name} 不再跟着跑者了。`,
    },
  },
  ja: {
    status: {
      unsupported: "非対応",
      noChannel: "チャンネル未設定",
      joining: (channel) => `#${channel} に参加中…`,
      listening: (channel) => `#${channel} を聞いています`,
      reconnecting: "再接続中…",
      offline: "未接続",
      forGame: "ゲームを待っています",
    },
    waiting: {
      idle: "出題していません",
      forGame: "ゲームを待っています",
      closes: (seconds) => `回答締切まで ${seconds} 秒`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `次の問題まで ${minutes} 分 ${pad(seconds)} 秒`
          : `次の問題まで ${seconds} 秒`,
    },
    channel: "チャンネル",
    channelPlaceholder: "あなたの Twitch ユーザー名",
    channelHint: "このチャンネルのチャットが参加します。",
    channelBad: "それはチャンネル名ではありません。",
    channelOk: (login) => `#${login} を聞きます`,
    round: "ラウンド",
    askNow: "今すぐ出題",
    nobodyFollowing: "追従者なし",
    kick: (name) => `${name} を外す`,
    botTranslate: "Botをあなたの言語で",
    bot: {
      rating: "評価",
      difficulty: "難易度",
      ask: (what, max, title, creator, seconds) =>
        `「${title}」${creator ? `（作者：${creator}）` : ""}の${what}（0〜${max}）を当ててね。` +
        `${seconds}秒以内で一番近い人の勝ち！`,
      nobody: (title, answer) => `誰も当たらず！「${title}」は ${answer} でした。`,
      won: (name, guess, answer) =>
        `${name} が ${guess} で勝ち、正解は ${answer}！これからランナーについて行くよ。` +
        `「!text hello」と送るとゲームに表示されます。`,
      kicked: (name) => `${name} はもうランナーについて行きません。`,
    },
  },
  ko: {
    status: {
      unsupported: "지원하지 않아요",
      noChannel: "채널이 없어요",
      joining: (channel) => `#${channel} 참여 중…`,
      listening: (channel) => `#${channel} 듣는 중`,
      reconnecting: "다시 연결 중…",
      offline: "연결되지 않았어요",
      forGame: "게임을 기다리고 있어요",
    },
    waiting: {
      idle: "질문하지 않아요",
      forGame: "게임을 기다리고 있어요",
      closes: (seconds) => `${seconds}초 후 답변 마감`,
      next: (minutes, seconds) =>
        minutes > 0 ? `다음 질문까지 ${minutes}분 ${pad(seconds)}초` : `다음 질문까지 ${seconds}초`,
    },
    channel: "채널",
    channelPlaceholder: "Twitch 아이디",
    channelHint: "이 채널의 채팅이 함께 놀아요.",
    channelBad: "채널 이름이 아니에요.",
    channelOk: (login) => `#${login} 채널을 들어요`,
    round: "라운드",
    askNow: "지금 질문하기",
    nobodyFollowing: "따라다니는 사람 없음",
    kick: (name) => `${name} 내보내기`,
    botTranslate: "봇이 내 언어로 말하기",
    bot: {
      rating: "평점",
      difficulty: "난이도",
      ask: (what, max, title, creator, seconds) =>
        `"${title}"${creator ? ` (제작: ${creator})` : ""}의 ${what}(0~${max})를 맞혀 보세요. ` +
        `${seconds}초 안에 가장 가까운 사람이 이깁니다!`,
      nobody: (title, answer) => `아무도 못 맞혔어요! "${title}"은(는) ${answer}입니다.`,
      won: (name, guess, answer) =>
        `${name} 님이 ${guess}(으)로 이겼어요, 정답은 ${answer}! 이제 러너를 따라다녀요. ` +
        `"!text hello"라고 보내면 게임에 표시됩니다.`,
      kicked: (name) => `${name} 님이 더 이상 러너를 따라다니지 않습니다.`,
    },
  },
  es: {
    status: {
      unsupported: "No compatible",
      noChannel: "Sin canal",
      joining: (channel) => `Entrando en #${channel}...`,
      listening: (channel) => `Escuchando #${channel}`,
      reconnecting: "Reconectando...",
      offline: "Sin conexión",
      forGame: "Esperando el juego",
    },
    waiting: {
      idle: "Sin preguntas",
      forGame: "Esperando el juego",
      closes: (seconds) => `Las respuestas cierran en ${seconds} s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Próxima pregunta en ${minutes} min ${pad(seconds)} s`
          : `Próxima pregunta en ${seconds} s`,
    },
    channel: "Canal",
    channelPlaceholder: "tu usuario de Twitch",
    channelHint: "El chat de este canal participa.",
    channelBad: "Ese no es un nombre de canal.",
    channelOk: (login) => `Escuchará #${login}`,
    round: "Ronda",
    askNow: "Preguntar ahora",
    nobodyFollowing: "Nadie te sigue",
    kick: (name) => `Expulsar a ${name}`,
    botTranslate: "El bot habla tu idioma",
    bot: {
      rating: "NOTA",
      difficulty: "DIFICULTAD",
      ask: (what, max, title, creator, seconds) =>
        `¡Adivina la ${what} (0-${max}) de "${title}"${creator ? ` de ${creator}` : ""}! ` +
        `La respuesta más cercana en ${seconds} segundos gana.`,
      nobody: (title, answer) => `¡Nadie acertó! "${title}" es ${answer}.`,
      won: (name, guess, answer) =>
        `¡${name} gana con ${guess}, y es ${answer}! Ahora sigues al runner: ` +
        `escribe "!text hello" y aparecerá en el juego.`,
      kicked: (name) => `${name} ya no sigue al runner.`,
    },
  },
  "pt-BR": {
    status: {
      unsupported: "Sem suporte",
      noChannel: "Sem canal",
      joining: (channel) => `Entrando em #${channel}...`,
      listening: (channel) => `Ouvindo #${channel}`,
      reconnecting: "Reconectando...",
      offline: "Sem conexão",
      forGame: "Esperando o jogo",
    },
    waiting: {
      idle: "Sem perguntas",
      forGame: "Esperando o jogo",
      closes: (seconds) => `As respostas fecham em ${seconds} s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Próxima pergunta em ${minutes} min ${pad(seconds)} s`
          : `Próxima pergunta em ${seconds} s`,
    },
    channel: "Canal",
    channelPlaceholder: "seu usuário da Twitch",
    channelHint: "O chat deste canal participa.",
    channelBad: "Esse não é um nome de canal.",
    channelOk: (login) => `Vai ouvir #${login}`,
    round: "Rodada",
    askNow: "Perguntar agora",
    nobodyFollowing: "Ninguém seguindo",
    kick: (name) => `Expulsar ${name}`,
    botTranslate: "O bot fala seu idioma",
    bot: {
      rating: "NOTA",
      difficulty: "DIFICULDADE",
      ask: (what, max, title, creator, seconds) =>
        `Adivinhe a ${what} (0-${max}) de "${title}"${creator ? ` de ${creator}` : ""}. ` +
        `O palpite mais próximo em ${seconds} segundos vence!`,
      nobody: (title, answer) => `Ninguém acertou! "${title}" é ${answer}.`,
      won: (name, guess, answer) =>
        `${name} vence com ${guess}, e é ${answer}! Agora você segue o runner: ` +
        `digite "!text hello" e aparece no jogo.`,
      kicked: (name) => `${name} não segue mais o runner.`,
    },
  },
  de: {
    status: {
      unsupported: "Nicht unterstützt",
      noChannel: "Kein Kanal",
      joining: (channel) => `Betrete #${channel}...`,
      listening: (channel) => `Verbunden mit #${channel}`,
      reconnecting: "Neuverbindung...",
      offline: "Nicht verbunden",
      forGame: "Warte auf das Spiel",
    },
    waiting: {
      idle: "Keine Fragen",
      forGame: "Warte auf das Spiel",
      closes: (seconds) => `Antworten schließen in ${seconds}s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Nächste Frage in ${minutes}m ${pad(seconds)}s`
          : `Nächste Frage in ${seconds}s`,
    },
    channel: "Kanal",
    channelPlaceholder: "dein Twitch-Login",
    channelHint: "Der Chat dieses Kanals spielt mit.",
    channelBad: "Das ist kein Kanalname.",
    channelOk: (login) => `Hört auf #${login}`,
    round: "Runde",
    askNow: "Jetzt fragen",
    nobodyFollowing: "Niemand folgt",
    kick: (name) => `${name} entfernen`,
    botTranslate: "Bot spricht deine Sprache",
    bot: {
      rating: "BEWERTUNG",
      difficulty: "SCHWIERIGKEIT",
      ask: (what, max, title, creator, seconds) =>
        `Rate die ${what} (0-${max}) von "${title}"${creator ? ` von ${creator}` : ""}. ` +
        `Der nächste Tipp in ${seconds} Sekunden gewinnt!`,
      nobody: (title, answer) => `Niemand hat geraten! "${title}" ist ${answer}.`,
      won: (name, guess, answer) =>
        `${name} gewinnt mit ${guess}, und es ist ${answer}! Du folgst jetzt dem Runner: ` +
        `schreib "!text hello" und es erscheint im Spiel.`,
      kicked: (name) => `${name} folgt dem Runner nicht mehr.`,
    },
  },
  fr: {
    status: {
      unsupported: "Non pris en charge",
      noChannel: "Aucune chaîne",
      joining: (channel) => `Connexion à #${channel}...`,
      listening: (channel) => `À l'écoute de #${channel}`,
      reconnecting: "Reconnexion...",
      offline: "Non connecté",
      forGame: "En attente du jeu",
    },
    waiting: {
      idle: "Pas de question",
      forGame: "En attente du jeu",
      closes: (seconds) => `Fin des réponses dans ${seconds} s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Prochaine question dans ${minutes} min ${pad(seconds)} s`
          : `Prochaine question dans ${seconds} s`,
    },
    channel: "Chaîne",
    channelPlaceholder: "ton identifiant Twitch",
    channelHint: "Le chat de cette chaîne participe.",
    channelBad: "Ce n'est pas un nom de chaîne.",
    channelOk: (login) => `Écoutera #${login}`,
    round: "Manche",
    askNow: "Poser maintenant",
    nobodyFollowing: "Personne ne suit",
    kick: (name) => `Exclure ${name}`,
    botTranslate: "Le bot parle ta langue",
    bot: {
      rating: "NOTE",
      difficulty: "DIFFICULTÉ",
      ask: (what, max, title, creator, seconds) =>
        `Devine la ${what} (0-${max}) de « ${title} »${creator ? ` de ${creator}` : ""}. ` +
        `Le pronostic le plus proche en ${seconds} secondes gagne !`,
      nobody: (title, answer) => `Personne n'a trouvé ! « ${title} » est à ${answer}.`,
      won: (name, guess, answer) =>
        `${name} gagne avec ${guess}, et c'est ${answer} ! Tu suis le runner maintenant : ` +
        `écris « !text hello » et ça s'affiche dans le jeu.`,
      kicked: (name) => `${name} ne suit plus le runner.`,
    },
  },
  it: {
    status: {
      unsupported: "Non supportato",
      noChannel: "Nessun canale",
      joining: (channel) => `Ingresso in #${channel}...`,
      listening: (channel) => `In ascolto su #${channel}`,
      reconnecting: "Riconnessione...",
      offline: "Non connesso",
      forGame: "In attesa del gioco",
    },
    waiting: {
      idle: "Nessuna domanda",
      forGame: "In attesa del gioco",
      closes: (seconds) => `Le risposte chiudono tra ${seconds} s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Prossima domanda tra ${minutes} min ${pad(seconds)} s`
          : `Prossima domanda tra ${seconds} s`,
    },
    channel: "Canale",
    channelPlaceholder: "il tuo utente Twitch",
    channelHint: "La chat di questo canale gioca con te.",
    channelBad: "Questo non è un nome di canale.",
    channelOk: (login) => `Ascolterà #${login}`,
    round: "Turno",
    askNow: "Chiedi ora",
    nobodyFollowing: "Nessuno ti segue",
    kick: (name) => `Espelli ${name}`,
    botTranslate: "Il bot parla la tua lingua",
    bot: {
      rating: "VALUTAZIONE",
      difficulty: "DIFFICOLTÀ",
      ask: (what, max, title, creator, seconds) =>
        `Indovina la ${what} (0-${max}) di «${title}»${creator ? `, di ${creator}` : ""}. ` +
        `Vince il pronostico più vicino entro ${seconds} secondi!`,
      nobody: (title, answer) => `Nessuno ha indovinato! «${title}» è ${answer}.`,
      won: (name, guess, answer) =>
        `${name} vince con ${guess}, ed è ${answer}! Adesso segui il runner: ` +
        `scrivi "!text hello" e comparirà nel gioco.`,
      kicked: (name) => `${name} non segue più il runner.`,
    },
  },
  ru: {
    status: {
      unsupported: "Не поддерживается",
      noChannel: "Канал не задан",
      joining: (channel) => `Подключаемся к #${channel}...`,
      listening: (channel) => `Слушаем #${channel}`,
      reconnecting: "Переподключение...",
      offline: "Нет подключения",
      forGame: "Ожидание игры",
    },
    waiting: {
      idle: "Без вопросов",
      forGame: "Ожидание игры",
      closes: (seconds) => `Ответы закроются через ${seconds} с`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Следующий вопрос через ${minutes} мин ${pad(seconds)} с`
          : `Следующий вопрос через ${seconds} с`,
    },
    channel: "Канал",
    channelPlaceholder: "ваш логин на Twitch",
    channelHint: "Чат этого канала играет вместе.",
    channelBad: "Это не имя канала.",
    channelOk: (login) => `Будем слушать #${login}`,
    round: "Раунд",
    askNow: "Спросить сейчас",
    nobodyFollowing: "Никто не следует",
    kick: (name) => `Убрать ${name}`,
    botTranslate: "Бот говорит на твоём языке",
    bot: {
      rating: "ОЦЕНКУ",
      difficulty: "СЛОЖНОСТЬ",
      ask: (what, max, title, creator, seconds) =>
        `Угадай ${what} (0-${max}) игры «${title}»${creator ? ` от ${creator}` : ""}. ` +
        `Побеждает самый близкий ответ за ${seconds} секунд!`,
      nobody: (title, answer) => `Никто не угадал! «${title}»: ${answer}.`,
      won: (name, guess, answer) =>
        `${name} побеждает с ответом ${guess}, правильный ответ ${answer}! ` +
        `Теперь компаньон следует за игроком: напиши «!text hello», и это появится в игре.`,
      kicked: (name) => `${name}: компаньон больше не следует за игроком.`,
    },
  },
  pl: {
    status: {
      unsupported: "Nieobsługiwane",
      noChannel: "Nie ustawiono kanału",
      joining: (channel) => `Dołączanie do #${channel}...`,
      listening: (channel) => `Słucham #${channel}`,
      reconnecting: "Ponowne łączenie...",
      offline: "Brak połączenia",
      forGame: "Czekam na grę",
    },
    waiting: {
      idle: "Bez pytań",
      forGame: "Czekam na grę",
      closes: (seconds) => `Odpowiedzi zamykają się za ${seconds} s`,
      next: (minutes, seconds) =>
        minutes > 0
          ? `Następne pytanie za ${minutes} min ${pad(seconds)} s`
          : `Następne pytanie za ${seconds} s`,
    },
    channel: "Kanał",
    channelPlaceholder: "twój login na Twitchu",
    channelHint: "Czat tego kanału gra razem z tobą.",
    channelBad: "To nie jest nazwa kanału.",
    channelOk: (login) => `Będę słuchać #${login}`,
    round: "Runda",
    askNow: "Zapytaj teraz",
    nobodyFollowing: "Nikt nie towarzyszy",
    kick: (name) => `Usuń ${name}`,
    botTranslate: "Bot mówi twoim językiem",
    bot: {
      rating: "OCENĘ",
      difficulty: "TRUDNOŚĆ",
      ask: (what, max, title, creator, seconds) =>
        `Zgadnij ${what} (0-${max}) gry „${title}”${creator ? ` od ${creator}` : ""}. ` +
        `Najbliższa odpowiedź w ciągu ${seconds} s wygrywa!`,
      nobody: (title, answer) => `Nikt nie zgadł! „${title}” to ${answer}.`,
      won: (name, guess, answer) =>
        `${name} wygrywa z odpowiedzią ${guess}, a prawidłowa to ${answer}! ` +
        `Teraz towarzyszysz graczowi: napisz „!text hello”, a pojawi się to w grze.`,
      kicked: (name) => `${name} już nie towarzyszy graczowi.`,
    },
  },
};

export function text(language: Language): Text {
  return (TEXT as Partial<Record<string, Text>>)[language] ?? en;
}
