// i18n.js — vi (default) + en. t('key', {x:1}) replaces {x}. Add a language: copy the `en` block.
const I18N = {
  vi: {
    title: 'Roulette', sub: 'Một ổ đạn, hai người, vài món đồ trên bàn. Ai cũng được dùng.',
    name: 'Tên của bạn', namePh: 'Khách quen', you: 'Bạn', bot: 'Chủ quán',
    create: 'Tạo phòng', join: 'Vào phòng', offline: 'Chơi với máy', code: 'Mã phòng (5 ký tự)', createBtn: 'Tạo phòng mới', joinBtn: 'Vào phòng', startOff: 'Ngồi xuống bàn',
    offHint: 'Đấu một mình với Chủ quán trên thiết bị này.', onlineOff: 'Không kết nối được Firebase: chỉ chơi được với máy.',
    resumeT: 'Ván đang dở', resumeB: 'Bạn còn một ván chưa xong.', resume: 'Tiếp tục',
    roomCode: 'Mã phòng — chạm để chép link', seats: 'Hai ghế', seatFree: 'Đang chờ người chơi…', host: 'Chủ phòng', off: 'mất kết nối',
    rules: 'Luật chơi', rTarget: 'Số hiệp thắng để thắng trận', rTargetD: 'Thắng đủ số hiệp này là thắng cả trận.', rPer: 'Vật phẩm mỗi lượt', rPerD: 'Tối đa bao nhiêu món được dùng trong một lượt.', rBot: 'Độ khó của máy',
    easy: 'Dễ', normal: 'Vừa', hard: 'Khó', onlyHost: 'Chỉ chủ phòng chỉnh được luật.',
    start: 'Bắt đầu', needTwo: 'Cần đủ 2 người.', waitHost: 'Chờ chủ phòng bắt đầu…', leave: 'Rời bàn', help: 'Luật', copied: 'Đã chép link mời',
    noRoom: 'Không tìm thấy phòng.', roomFull: 'Phòng đã đủ người.', started: 'Ván đã bắt đầu rồi.', needName: 'Hãy nhập tên.',
    yourTurn: 'Lượt của bạn', theirTurn: 'Lượt của {n}', again: 'Đạn lép — bắn tiếp!', fireOpp: 'Bắn đối thủ', fireSelf: 'Bắn bản thân', fireSelfD: 'lép = bắn tiếp', fireOppD: 'hết lượt',
    useItem: 'Dùng', pick: 'Chạm một vật phẩm trên bàn để xem công dụng.', itemsLeft: 'Dùng {n}/{m} món', tableEmpty: 'Bàn trống. Chờ nạp đạn.',
    live: 'ĐẠN THẬT', blank: 'ĐẠN LÉP', liveS: 'thật', blankS: 'lép', counter: 'Trong ổ', hp: 'Máu', round: 'Hiệp {n}', wins: 'Thắng {a}–{b}',
    aimSelf: '{n} chĩa vào chính mình…', aimOpp: '{n} chĩa vào {m}…', miss: 'Trượt', blockedT: 'Khay chặn!', dmg: '-{n}',
    loading: 'Nạp đạn: {l} thật · {b} lép', newItems: '+{n} vật phẩm lên bàn', roundN: 'Hiệp {n} · {h} máu mỗi người', skipped: '{n} bị mất lượt!',
    peekYou: 'Buồng hiện tại là: {k}', peekPhone: 'Buồng thứ {i} tính từ giờ là: {k}', peekThem: '{n} đã nhìn trộm ổ đạn.', ejected: 'Rút ra: {k}', flipped: 'Đồng xu xoay… viên hiện tại đã đổi loại.', flipYou: 'Đã đổi: giờ là {k}', usedBy: '{n} dùng {i}',
    roundWin: '{n} thắng hiệp!', nextRound: 'Hiệp tiếp', matchWin: '{n} thắng cả trận!', again2: 'Chơi lại', toLobby: 'Về sảnh', youWin: 'Bạn thắng!', youLose: 'Bạn thua…', loserStarts: 'Người thua mở hiệp sau.',
    logShot: '{a} bắn {b}: {k}{d}', logSelf: '{a} bắn chính mình: {k}{d}', logItem: '{a} dùng {i}', logLoad: 'Nạp {l} thật + {b} lép', logRound: 'Hiệp {n} bắt đầu', logEnd: '{n} thắng hiệp', logSkip: '{n} mất lượt', logAgain: '{n} bắn tiếp', logBlocked: ' (khay chặn)', logDmg: ' −{n} máu',
    helpT: 'Cách chơi', helpBody: [
      'Hai người chung một ổ đạn có đạn thật và đạn lép, xáo ngẫu nhiên. Con số mỗi loại luôn hiện trên bàn, thứ tự thì không.',
      'Mỗi lượt: bắn đối thủ (đạn thật = −1 máu, hết lượt) hoặc bắn chính mình (lép = được bắn tiếp, thật = mất máu và hết lượt).',
      'Vật phẩm đặt giữa bàn là của chung: ai đến lượt thì dùng được, mỗi lượt tối đa vài món. Hết đạn thì nạp lại và thêm vật phẩm.',
      'Về 0 máu là thua hiệp. Thắng đủ số hiệp là thắng trận.',
      'Chạm vật phẩm để đọc công dụng; bấm đúp để dùng nhanh. Phím: 1 = bắn đối thủ, 2 = bắn mình.'
    ],
    items: {
      loupe: ['Kính lúp', 'Xem riêng bạn: viên đạn đang ở buồng bắn là thật hay lép.'],
      phone: ['Điện thoại', 'Xem riêng bạn: một buồng ngẫu nhiên phía sau là thật hay lép.'],
      beer: ['Ly bia', 'Rút bỏ viên đang ở buồng bắn; cả bàn thấy nó là gì.'],
      lemon: ['Chanh đá', 'Hồi 1 máu (không quá mức tối đa).'],
      bell: ['Chuông đóng cửa', 'Đối thủ mất lượt kế tiếp: bạn được đi liền hai lượt.'],
      spin: ['Xoay ổ', 'Xáo lại các viên còn lại. Mọi thông tin đã nhìn trộm đều mất.'],
      coin: ['Đồng xu', 'Đảo loại viên ở buồng bắn. Bảng đếm công khai KHÔNG đổi, nên có thể đánh lừa đối thủ.'],
      whisky: ['Ly whisky', 'Phát bắn kế tiếp, nếu là đạn thật, gây 2 sát thương.'],
      tray: ['Khay gỗ', 'Chặn trọn một viên đạn thật bắn trúng bạn.']
    },
    exit: 'Thoát', music: 'Nhạc nền', emote: 'Biểu cảm', emotes: { smug: 'Đắc ý', laugh: 'Cười', scared: 'Sợ', angry: 'Giận', hurt: 'Đau' }, confirmLeave: 'Rời ván đang chơi?', mute: 'Âm thanh', theyOff: 'Đối thủ đang mất kết nối'
  },
  en: {
    title: 'Roulette', sub: 'One cylinder, two players, a few items on the table. Anyone may use them.',
    name: 'Your name', namePh: 'Regular', you: 'You', bot: 'Barkeep',
    create: 'Create room', join: 'Join room', offline: 'Play vs bot', code: 'Room code (5 chars)', createBtn: 'Create new room', joinBtn: 'Join room', startOff: 'Sit down',
    offHint: 'Play alone against the Barkeep on this device.', onlineOff: 'Firebase is unreachable: only play-vs-bot works.',
    resumeT: 'Game in progress', resumeB: 'You have an unfinished game.', resume: 'Resume',
    roomCode: 'Room code — tap to copy invite link', seats: 'Two seats', seatFree: 'Waiting for a player…', host: 'Host', off: 'offline',
    rules: 'Rules', rTarget: 'Round wins needed', rTargetD: 'Win this many rounds to win the match.', rPer: 'Items per turn', rPerD: 'How many items one turn may use.', rBot: 'Bot difficulty',
    easy: 'Easy', normal: 'Normal', hard: 'Hard', onlyHost: 'Only the host can change rules.',
    start: 'Start', needTwo: 'Two players needed.', waitHost: 'Waiting for the host to start…', leave: 'Leave table', help: 'Rules', copied: 'Invite link copied',
    noRoom: 'Room not found.', roomFull: 'The room is full.', started: 'The game already started.', needName: 'Enter a name.',
    yourTurn: 'Your turn', theirTurn: "{n}'s turn", again: 'Blank — shoot again!', fireOpp: 'Shoot opponent', fireSelf: 'Shoot yourself', fireSelfD: 'blank = go again', fireOppD: 'ends turn',
    useItem: 'Use', pick: 'Tap an item on the table to read what it does.', itemsLeft: 'Used {n}/{m} items', tableEmpty: 'The table is empty. Wait for the reload.',
    live: 'LIVE', blank: 'BLANK', liveS: 'live', blankS: 'blank', counter: 'In the cylinder', hp: 'HP', round: 'Round {n}', wins: 'Won {a}–{b}',
    aimSelf: '{n} aims at themselves…', aimOpp: '{n} aims at {m}…', miss: 'Miss', blockedT: 'Blocked!', dmg: '-{n}',
    loading: 'Loading: {l} live · {b} blank', newItems: '+{n} items on the table', roundN: 'Round {n} · {h} HP each', skipped: '{n} loses a turn!',
    peekYou: 'Current chamber: {k}', peekPhone: 'Chamber #{i} from now: {k}', peekThem: '{n} peeked at the cylinder.', ejected: 'Ejected: {k}', flipped: 'Coin spins… the current shell changed type.', flipYou: 'Flipped: now {k}', usedBy: '{n} uses {i}',
    roundWin: '{n} wins the round!', nextRound: 'Next round', matchWin: '{n} wins the match!', again2: 'Play again', toLobby: 'Back to lobby', youWin: 'You win!', youLose: 'You lose…', loserStarts: 'The loser opens the next round.',
    logShot: '{a} shoots {b}: {k}{d}', logSelf: '{a} shoots self: {k}{d}', logItem: '{a} uses {i}', logLoad: 'Loaded {l} live + {b} blank', logRound: 'Round {n} begins', logEnd: '{n} wins the round', logSkip: '{n} loses a turn', logAgain: '{n} goes again', logBlocked: ' (tray)', logDmg: ' −{n} HP',
    helpT: 'How to play', helpBody: [
      'Two players share one cylinder of live and blank shells in random order. The count of each is always shown; the order is not.',
      'On your turn: shoot the opponent (live = −1 HP, turn ends) or shoot yourself (blank = shoot again, live = lose HP and the turn ends).',
      'Items in the middle of the table are shared: whoever’s turn it is may use them, up to a few per turn. When the cylinder runs dry it is reloaded and more items appear.',
      '0 HP loses the round. Win enough rounds to win the match.',
      'Tap an item to read it; double-click to use it. Keys: 1 = shoot opponent, 2 = shoot yourself.'
    ],
    items: {
      loupe: ['Loupe', 'Privately see whether the shell in the firing chamber is live or blank.'],
      phone: ['Phone', 'Privately see a random later chamber.'],
      beer: ['Beer', 'Eject the shell in the firing chamber; everyone sees what it was.'],
      lemon: ['Lemon soda', 'Heal 1 HP (up to the maximum).'],
      bell: ['Last-call bell', 'The opponent loses their next turn: you go twice in a row.'],
      spin: ['Spin', 'Reshuffle the remaining shells. Everything anyone peeked is forgotten.'],
      coin: ['Coin', 'Flip the type of the firing chamber. The public counter does NOT change, so it can bluff.'],
      whisky: ['Whisky', 'Your next shot deals 2 damage if it is live.'],
      tray: ['Wooden tray', 'Fully blocks one live shell that would hit you.']
    },
    exit: 'Exit', music: 'Music', emote: 'Emote', emotes: { smug: 'Smug', laugh: 'Laugh', scared: 'Scared', angry: 'Angry', hurt: 'Ouch' }, confirmLeave: 'Leave the current game?', mute: 'Sound', theyOff: 'Opponent is disconnected'
  }
};
let LANG = (function () { try { const s = localStorage.getItem('rou_lang'); if (s && I18N[s]) return s; } catch (e) {} return (navigator.language || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi'; })();
function setLang(l) { if (I18N[l]) { LANG = l; try { localStorage.setItem('rou_lang', l); } catch (e) {} } }
function t(key, v) {
  let s = I18N[LANG][key]; if (s == null) s = I18N.vi[key]; if (s == null) return key;
  if (typeof s !== 'string') return s;
  return v ? s.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m) : s;
}
