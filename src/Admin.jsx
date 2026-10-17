import { useEffect, useRef, useState } from 'react';
import { getBridgeSocketUrl } from './live-bridge.js';
import {
  ADMIN_TEST_EVENT_KEY,
  DEFAULT_LIVE_SETTINGS,
  GIFT_EFFECTS,
  MAX_LIVE_HINTS,
  SUGGESTED_GIFTS,
  getAutomaticLiveHints,
  loadGiftCatalog,
  loadLiveSettings,
  normalizeGiftCatalog,
  normalizeLiveSettings,
  saveGiftCatalog,
  saveLiveSettings,
} from './live-settings.js';

const LED_IMAGE_WIDTH = 768;
const LED_IMAGE_HEIGHT = 320;
const MAX_LED_IMAGE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_LED_IMAGE_DATA_URL_LENGTH = 300_000;

function createBridgeConfig(settings, token) {
  return {
    type: 'admin-config',
    token,
    settings: {
      giftMappings: settings.giftMappings,
      sceneSettings: {
        zoomOnLike: settings.zoomOnLike,
        commentMappings: settings.commentMappings,
        liveHints: settings.liveHints,
      },
    },
  };
}

function Admin() {
  const [settings, setSettings] = useState(loadLiveSettings);
  const [observedGifts, setObservedGifts] = useState(loadGiftCatalog);
  const [giftSelection, setGiftSelection] = useState({});
  const [commentMappingOpen, setCommentMappingOpen] = useState(() => Object.fromEntries(
    GIFT_EFFECTS.map(({ id }) => [id, Boolean(settings.commentMappings[id])]),
  ));
  const [status, setStatus] = useState('Đang nối với bridge…');
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const adminTokenRef = useRef('');
  const bridgeSocket = useRef(null);
  const savedSettings = useRef(settings);

  useEffect(() => {
    try {
      saveGiftCatalog(observedGifts);
    } catch (storageError) {
      console.error('Unable to save the observed gift catalog:', storageError);
      setError('Không lưu được danh sách quà đã nhận trên trình duyệt này.');
    }
  }, [observedGifts]);

  useEffect(() => {
    let disposed = false;
    let socket;
    let reconnectTimer;
    let reconnectDelay = 1000;

    function connect() {
      if (disposed) return;
      socket = new WebSocket(getBridgeSocketUrl());
      bridgeSocket.current = socket;
      socket.addEventListener('open', () => {
        if (disposed) {
          socket.close();
          return;
        }
        reconnectDelay = 1000;
        socket.send(JSON.stringify(createBridgeConfig(savedSettings.current, adminTokenRef.current)));
      });
      socket.addEventListener('message', (message) => {
        let payload;
        try {
          payload = JSON.parse(message.data);
        } catch (parseError) {
          console.error('Invalid message from Bar Live bridge:', parseError);
          return;
        }
        if (payload.type === 'admin-config-saved') {
          setError('');
          setStatus('Bridge đã nhận cấu hình');
        } else if (payload.type === 'admin-config-error') {
          setStatus('Bridge chưa nhận cấu hình');
          setError(typeof payload.message === 'string' ? payload.message : 'Bridge từ chối cấu hình.');
        } else if (payload.type === 'scene-settings' && payload.settings) {
          const nextSettings = normalizeLiveSettings({
            ...savedSettings.current,
            ...payload.settings,
          });
          savedSettings.current = nextSettings;
          setSettings(nextSettings);
        } else if (payload.type === 'event' && payload.event?.type === 'gift') {
          const giftName = typeof payload.event.giftName === 'string' ? payload.event.giftName.trim() : '';
          if (giftName && !/^quà\s+#\d+$/i.test(giftName)) {
            setObservedGifts((current) => normalizeGiftCatalog([...current, giftName]));
          }
        }
      });
      socket.addEventListener('error', (socketError) => {
        console.error('Bar Live admin bridge socket error:', socketError);
      });
      socket.addEventListener('close', () => {
        if (disposed) return;
        if (bridgeSocket.current === socket) bridgeSocket.current = null;
        setStatus('Chưa nối bridge — cấu hình vẫn lưu trên máy');
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      });
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      if (socket?.readyState === WebSocket.OPEN) socket.close();
    };
  }, []);

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function saveSettings(nextSettings = settings) {
    try {
      const normalizedSettings = saveLiveSettings(nextSettings);
      setSettings(normalizedSettings);
      savedSettings.current = normalizedSettings;
      setError('');
      if (socketIsOpen()) {
        bridgeSocket.current.send(JSON.stringify(createBridgeConfig(normalizedSettings, adminTokenRef.current)));
      }
      setStatus(socketIsOpen()
        ? 'Đã lưu và gửi cấu hình tới bridge.'
        : 'Đã lưu trên máy; bridge sẽ nhận khi kết nối lại.');
    } catch (saveError) {
      console.error('Unable to save Bar Live settings:', saveError);
      setError('Không lưu được cấu hình trên trình duyệt này.');
    }
  }

  function socketIsOpen() {
    return bridgeSocket.current?.readyState === WebSocket.OPEN;
  }

  function resetSettings() {
    saveSettings(DEFAULT_LIVE_SETTINGS);
  }

  function testSceneEvent(event) {
    try {
      window.localStorage.setItem(ADMIN_TEST_EVENT_KEY, JSON.stringify({
        id: `${Date.now()}-${Math.random()}`,
        event: {
          ...event,
          user: '__bar_admin_test__',
          displayName: 'TEST',
          demo: true,
          adminTest: true,
        },
      }));
      setStatus('Đã gửi sự kiện thử sang cảnh LIVE đang mở.');
      setError('');
    } catch (testError) {
      console.error('Unable to send Bar Live test event:', testError);
      setError('Không gửi được sự kiện thử. Hãy kiểm tra quyền lưu trữ của trình duyệt.');
    }
  }

  async function handleLedImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_LED_IMAGE_FILE_BYTES) {
      setError('Ảnh tải lên phải nhỏ hơn 8 MB.');
      return;
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = LED_IMAGE_WIDTH;
      canvas.height = LED_IMAGE_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create a canvas for the LED image.');
      const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

      let quality = 0.86;
      let imageData = canvas.toDataURL('image/jpeg', quality);
      while (imageData.length > MAX_LED_IMAGE_DATA_URL_LENGTH && quality > 0.4) {
        quality -= 0.1;
        imageData = canvas.toDataURL('image/jpeg', quality);
      }
      if (imageData.length > MAX_LED_IMAGE_DATA_URL_LENGTH) {
        throw new Error('The compressed LED image exceeds the storage limit.');
      }
      updateSetting('ledImage', imageData);
      setError('');
      setStatus('Ảnh đã chuẩn bị — lưu cấu hình để áp dụng lên bảng LED.');
    } catch (imageError) {
      console.error('Unable to prepare the LED image:', imageError);
      setError('Không xử lý được ảnh. Thử chọn một ảnh khác.');
    } finally {
      bitmap?.close();
    }
  }

  const availableGifts = [...new Set([
    ...observedGifts,
    ...SUGGESTED_GIFTS.flatMap(({ name, aliases }) => [name, ...aliases]),
    ...Object.values(settings.giftMappings)
      .flatMap((value) => value.split(';').map((name) => name.trim()).filter(Boolean)),
  ])].sort((a, b) => a.localeCompare(b));
  const suggestedGiftNames = SUGGESTED_GIFTS.flatMap(({ name, aliases }) => [name, ...aliases]);
  const configuredGiftNames = Object.values(settings.giftMappings)
    .flatMap((value) => value.split(';').map((name) => name.trim()).filter(Boolean));
  const isObservedGift = (gift) => observedGifts.some((name) => name.toLocaleLowerCase() === gift.toLocaleLowerCase());
  const isSuggestedGift = (gift) => suggestedGiftNames.some((name) => name.toLocaleLowerCase() === gift.toLocaleLowerCase());
  const automaticHints = getAutomaticLiveHints(settings);

  function addGiftToEffect(effectId) {
    const giftName = giftSelection[effectId];
    if (!giftName) return;
    const currentNames = settings.giftMappings[effectId]
      .split(';')
      .map((name) => name.trim())
      .filter(Boolean);
    if (!currentNames.some((name) => name.toLocaleLowerCase() === giftName.toLocaleLowerCase())) {
      updateSetting('giftMappings', {
        ...settings.giftMappings,
        [effectId]: [...currentNames, giftName].join(';'),
      });
    }
    setGiftSelection((current) => ({ ...current, [effectId]: '' }));
  }

  return (
    <main className="h-full overflow-y-auto bg-[#080611] text-[#f4f0ff]">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.25em] text-[#ff3df2]">BAR LIVE / CONTROL ROOM</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Trang quản lý</h1>
            <p className="mt-2 text-sm text-white/60">Chỉnh hiệu ứng sân khấu và quà tặng TikTok LIVE.</p>
          </div>
          <a
            className="rounded-xl border border-[#27e8ff]/40 bg-[#27e8ff]/10 px-4 py-2 text-sm font-bold text-[#9bfaff] transition hover:bg-[#27e8ff]/20"
            href="/"
          >
            Mở cảnh LIVE
          </a>
        </header>

        <section className="rounded-2xl border border-[#27e8ff]/20 bg-[#27e8ff]/[0.04] p-5">
          <label className="block text-sm font-semibold" htmlFor="bridge-admin-token">
            Mật khẩu quản trị bridge
          </label>
          <p className="mt-1 text-xs text-white/55">
            Nhập BAR_ADMIN_TOKEN đã cấu hình riêng trên Render. Token chỉ được giữ trong tab này.
          </p>
          <input
            autoComplete="current-password"
            className="mt-3 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[#27e8ff]/60"
            id="bridge-admin-token"
            onChange={(event) => {
              adminTokenRef.current = event.target.value;
              setAdminToken(event.target.value);
            }}
            type="password"
            value={adminToken}
          />
        </section>

        <details className="group rounded-2xl border border-[#ff3df2]/25 bg-[#ff3df2]/[0.04]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-bold">Test tính năng</span>
              <span className="mt-1 block text-sm text-white/55">Mở để chạy thử hiệu ứng trên tab cảnh LIVE, không cần TikTok đang kết nối.</span>
            </span>
            <span aria-hidden="true" className="text-xl text-[#ff8bdf] transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-white/10 p-5">
            <p className="mb-3 text-xs text-white/50">Các nút chỉ tạo sự kiện thử trên cảnh LIVE cùng trình duyệt; chúng không phát quà thật hay gửi sự kiện đến TikTok. Nhân vật thử tự biến mất sau 10 giây.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GIFT_EFFECTS.map(({ id, label }) => (
                <button
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold transition hover:border-[#27e8ff]/40 hover:bg-[#27e8ff]/[0.06]"
                  key={id}
                  onClick={() => testSceneEvent({
                    type: 'gift',
                    giftName: `Test: ${label}`,
                    action: id,
                  })}
                  type="button"
                >
                  Thử: {label}
                </button>
              ))}
              <button
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold transition hover:border-[#27e8ff]/40 hover:bg-[#27e8ff]/[0.06]"
                onClick={() => testSceneEvent({ type: 'like', likeCount: 5 })}
                type="button"
              >
                Thử thả tim
              </button>
              <button
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold transition hover:border-[#27e8ff]/40 hover:bg-[#27e8ff]/[0.06]"
                onClick={() => testSceneEvent({ type: 'comment', text: 'hey' })}
                type="button"
              >
                Thử comment nhảy
              </button>
              {GIFT_EFFECTS.filter(({ id }) => settings.commentMappings[id].trim()).map(({ id, label }) => (
                <button
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm font-semibold transition hover:border-[#27e8ff]/40 hover:bg-[#27e8ff]/[0.06]"
                  key={`comment-${id}`}
                  onClick={() => testSceneEvent({
                    type: 'comment',
                    text: settings.commentMappings[id].split(';').map((keyword) => keyword.trim()).find(Boolean) || '',
                  })}
                  type="button"
                >
                  Thử comment: {label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Cài đặt đèn">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-bold">Đèn sân khấu</h2>
            <p className="mt-1 text-sm text-white/55">Bật/tắt đèn wash và điều chỉnh tốc độ lia.</p>
            <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-black/20 p-4">
              <span>
                <span className="block font-semibold">Đèn moving-head</span>
                <span className="text-xs text-white/50">Chùm spotlight quét sân</span>
              </span>
              <input
                checked={settings.lightsEnabled}
                className="h-5 w-5 accent-[#ff3df2]"
                onChange={(event) => updateSetting('lightsEnabled', event.target.checked)}
                type="checkbox"
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-black/20 p-4">
              <span>
                <span className="block font-semibold">Laser</span>
                <span className="text-xs text-white/50">Tia và vệt sáng chiếu xuống sàn</span>
              </span>
              <input
                checked={settings.lasersEnabled}
                className="h-5 w-5 accent-[#27e8ff]"
                onChange={(event) => updateSetting('lasersEnabled', event.target.checked)}
                type="checkbox"
              />
            </label>
            <label className="mt-5 block">
              <span className="flex items-center justify-between font-semibold">
                Tốc độ lia đèn <span className="text-[#9bfaff]">{settings.lightSpeed.toFixed(1)}×</span>
              </span>
              <input
                className="mt-3 w-full accent-[#27e8ff]"
                max="2"
                min="0.5"
                onChange={(event) => updateSetting('lightSpeed', Number(event.target.value))}
                step="0.1"
                type="range"
                value={settings.lightSpeed}
              />
              <span className="mt-1 flex justify-between text-xs text-white/45"><span>Chậm</span><span>Nhanh</span></span>
            </label>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-bold">Hiệu ứng tương tác</h2>
            <p className="mt-1 text-sm text-white/55">Chọn hành vi khi người xem thả tim.</p>
            <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-black/20 p-4">
              <span>
                <span className="block font-semibold">Thả tim để zoom</span>
                <span className="text-xs text-white/50">Mỗi viewer tối đa 1 lần zoom trong 3 giây</span>
              </span>
              <input
                checked={settings.zoomOnLike}
                className="h-5 w-5 accent-[#ff3df2]"
                onChange={(event) => updateSetting('zoomOnLike', event.target.checked)}
                type="checkbox"
              />
            </label>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
              Lệnh comment được gán trong từng hiệu ứng bên dưới; comment phải khớp chính xác, không phân biệt hoa/thường. Nhập nhiều từ khóa cách nhau bằng dấu chấm phẩy. Nếu trùng từ khóa, hiệu ứng đứng trước trong danh sách sẽ được ưu tiên. “hey” hoặc bình luận có chữ “nhảy” vẫn kích hoạt điệu nhảy nếu chưa được gán lệnh riêng.
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Màn hình sân khấu</h2>
            <p className="mt-1 text-sm text-white/55">Đổi chữ trên bảng LED và hai bảng tên trước booth DJ.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['ledTitle', 'Tiêu đề LED', 40],
              ['ledSubtitle', 'Dòng chữ nhỏ trên LED', 80],
              ['djName', 'Tên màn hình bên trái', 32],
              ['mcName', 'Tên màn hình bên phải', 32],
            ].map(([key, label, maxLength]) => (
              <label className="block" key={key}>
                <span className="mb-1.5 block text-sm font-semibold">{label}</span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition placeholder:text-white/25 focus:border-[#27e8ff]/70"
                  maxLength={maxLength}
                  onChange={(inputEvent) => updateSetting(key, inputEvent.target.value)}
                  type="text"
                  value={settings[key]}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
            <label className="block">
              <span className="block font-semibold">Ảnh nền bảng LED</span>
              <span className="mt-1 block text-xs text-white/50">JPG, PNG hoặc WebP; ảnh sẽ được cắt vừa màn hình 16:7 và nén tự động.</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="mt-3 block w-full text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#27e8ff]/15 file:px-3 file:py-2 file:font-semibold file:text-[#9bfaff] hover:file:bg-[#27e8ff]/25"
                onChange={handleLedImageChange}
                type="file"
              />
            </label>
            {settings.ledImage && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <img
                  alt="Xem trước ảnh nền bảng LED"
                  className="h-20 w-48 rounded-lg border border-white/10 object-cover"
                  src={settings.ledImage}
                />
                <button
                  className="rounded-lg border border-rose-300/25 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-300/10"
                  onClick={() => updateSetting('ledImage', '')}
                  type="button"
                >
                  Gỡ ảnh
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Gợi ý trên màn hình LIVE</h2>
              <p className="mt-1 text-sm text-white/55">Gợi ý comment tự lấy từ các từ khóa đã gán bên dưới. Bấm “Lưu cấu hình” để cập nhật sang cảnh LIVE.</p>
            </div>
            <button
              className="rounded-lg border border-[#27e8ff]/30 px-3 py-2 text-sm font-semibold text-[#9bfaff] transition hover:bg-[#27e8ff]/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={settings.liveHints.length >= MAX_LIVE_HINTS}
              onClick={() => updateSetting('liveHints', [...settings.liveHints, { trigger: '', effect: '' }])}
              type="button"
            >
              Thêm gợi ý
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {automaticHints.map((hint, index) => (
              <div className="grid gap-2 rounded-xl border border-[#27e8ff]/15 bg-[#27e8ff]/[0.04] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center" key={`automatic-${index}-${hint.trigger}-${hint.effect}`}>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-white/45">Điều kiện · tự động</span>
                  <span className="text-sm"><span aria-hidden="true" className="mr-1.5">{hint.icon}</span>{hint.trigger}</span>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-white/45">Hiệu ứng · tự động</span>
                  <span className="text-sm text-[#9bfaff]">{hint.effect}</span>
                </div>
                <span aria-hidden="true" className="hidden text-xs text-white/40 sm:block">Tự đồng bộ</span>
              </div>
            ))}
            {settings.liveHints.map((hint, index) => (
              <div className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" key={index}>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-white/65">Điều kiện</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition placeholder:text-white/25 focus:border-[#27e8ff]/70"
                    maxLength={40}
                    onChange={(event) => updateSetting('liveHints', settings.liveHints.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, trigger: event.target.value } : item
                    )))}
                    placeholder="Ví dụ: Cmt: Hey hey"
                    type="text"
                    value={hint.trigger}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-white/65">Hiệu ứng</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition placeholder:text-white/25 focus:border-[#27e8ff]/70"
                    maxLength={40}
                    onChange={(event) => updateSetting('liveHints', settings.liveHints.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, effect: event.target.value } : item
                    )))}
                    placeholder="Ví dụ: đổi nhân vật"
                    type="text"
                    value={hint.effect}
                  />
                </label>
                <button
                  aria-label={`Xóa gợi ý ${index + 1}`}
                  className="rounded-lg border border-rose-300/25 px-3 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-300/10"
                  onClick={() => updateSetting('liveHints', settings.liveHints.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                >
                  Xóa
                </button>
              </div>
            ))}
            {!settings.liveHints.length && (
              <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">Chưa có gợi ý nào.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold">Gán quà tặng</h2>
            <p className="mt-1 text-sm text-white/55">Gán quà hoặc mở “Gán comment” trong từng hiệu ứng để đặt lệnh riêng.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GIFT_EFFECTS.map(({ id, label }) => (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4" key={id}>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold">{label}</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition placeholder:text-white/25 focus:border-[#27e8ff]/70"
                    onChange={(event) => updateSetting('giftMappings', {
                      ...settings.giftMappings,
                      [id]: event.target.value,
                    })}
                    placeholder="Để trống nếu không gán"
                    type="text"
                    value={settings.giftMappings[id]}
                  />
                </label>
                <div className="mt-2">
                  <button
                    aria-expanded={Boolean(commentMappingOpen[id])}
                    className="rounded-lg border border-[#ff3df2]/25 px-3 py-2 text-sm font-semibold text-[#ffb5f0] transition hover:bg-[#ff3df2]/10"
                    onClick={() => setCommentMappingOpen((current) => ({
                      ...current,
                      [id]: !current[id],
                    }))}
                    type="button"
                  >
                    {commentMappingOpen[id] ? 'Ẩn gán comment' : 'Gán comment'}
                    {settings.commentMappings[id].trim() ? ' · Đã gán' : ''}
                  </button>
                  {commentMappingOpen[id] && (
                    <label className="mt-2 block">
                      <span className="mb-1.5 block text-xs text-white/55">Từ khóa comment kích hoạt {label}</span>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition placeholder:text-white/25 focus:border-[#ff3df2]/70"
                        maxLength={500}
                        onChange={(event) => updateSetting('commentMappings', {
                          ...settings.commentMappings,
                          [id]: event.target.value,
                        })}
                        placeholder="Để trống nếu không gán · nhiều từ khóa cách nhau bằng dấu ;"
                        type="text"
                        value={settings.commentMappings[id]}
                      />
                    </label>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    aria-label={`Chọn quà cho ${label}`}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#151222] px-2 py-2 text-sm text-white outline-none focus:border-[#27e8ff]/70"
                    onChange={(event) => setGiftSelection((current) => ({ ...current, [id]: event.target.value }))}
                    value={giftSelection[id] || ''}
                  >
                    <option value="">Chọn quà trong danh sách…</option>
                    {availableGifts.map((giftName) => (
                      <option key={giftName} value={giftName}>{giftName}</option>
                    ))}
                  </select>
                  <button
                    className="shrink-0 rounded-lg border border-[#27e8ff]/30 px-3 py-2 text-sm font-semibold text-[#9bfaff] transition hover:bg-[#27e8ff]/10 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!giftSelection[id]}
                    onClick={() => addGiftToEffect(id)}
                    type="button"
                  >
                    Thêm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Danh sách quà</h2>
              <p className="mt-1 text-sm text-white/55">
                Đã nhận khi live: {observedGifts.length} · Gợi ý: {SUGGESTED_GIFTS.length}
              </p>
            </div>
          </div>
          <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-sm text-amber-100/80">
            TikTok không gửi danh mục đầy đủ trong event thường. Danh sách dưới đây gồm quà thấy thực tế khi bridge nhận được tên và một số gợi ý; quà gợi ý có thể không có trong LIVE của mày.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {observedGifts.map((giftName) => (
              <span className="rounded-full border border-[#27e8ff]/30 bg-[#27e8ff]/10 px-3 py-1 text-sm text-[#b8fbff]" key={`seen-${giftName}`}>
                {giftName} <span className="text-[10px] text-white/45">đã nhận</span>
              </span>
            ))}
            {suggestedGiftNames.filter((gift) => !isObservedGift(gift)).map((giftName) => (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm text-white/75" key={`suggested-${giftName}`}>
                {giftName} <span className="text-[10px] text-white/45">gợi ý</span>
              </span>
            ))}
            {configuredGiftNames
              .filter((gift) => !isObservedGift(gift) && !isSuggestedGift(gift))
              .map((giftName) => (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm text-white/75" key={`configured-${giftName}`}>
                {giftName} <span className="text-[10px] text-white/45">đã gán</span>
              </span>
            ))}
          </div>
        </section>

        <footer className="sticky bottom-0 -mx-4 mt-auto flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#080611]/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
          <button
            className="rounded-xl bg-gradient-to-r from-[#ff3df2] to-[#8b5cf6] px-5 py-3 font-bold text-white shadow-lg shadow-[#ff3df2]/15 transition hover:brightness-110"
            onClick={() => saveSettings()}
            type="button"
          >
            Lưu cấu hình
          </button>
          <button
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10"
            onClick={resetSettings}
            type="button"
          >
            Khôi phục mặc định
          </button>
          <p aria-live="polite" className="w-full text-sm text-white/55 sm:ml-auto sm:w-auto">{status}</p>
          {error && <p role="alert" className="w-full text-sm text-rose-300">{error}</p>}
        </footer>
      </div>
    </main>
  );
}

export default Admin;
