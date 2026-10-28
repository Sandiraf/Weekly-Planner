(() => {
  const config = window.PLANNER_SUPABASE_CONFIG || {};
  const status = document.getElementById('syncStatus');
  const form = document.getElementById('syncForm');
  const emailInput = document.getElementById('syncEmail');
  const passwordInput = document.getElementById('syncPassword');
  const createButton = document.getElementById('createAccountButton');
  const signOutButton = document.getElementById('syncSignOut');

  const setStatus = text => { status.textContent = text; };
  if (!window.supabase?.createClient || !config.url || !config.key) {
    setStatus('Sinkronisasi belum dikonfigurasi; agenda hanya tersimpan di perangkat ini.');
    form.hidden = true;
    return;
  }

  const client = window.supabase.createClient(config.url, config.key);
  let user = null;
  let channel = null;
  let saveTimer = null;
  let pollTimer = null;
  let lastPayload = '';
  let pendingPayload = null;

  const serialize = value => JSON.stringify(value);
  const mergeInitialData = (local, cloud) => {
    const merged = { ...(cloud || {}) };
    for (const [date, localEntry] of Object.entries(local || {})) {
      if (date === 'subtitle' || !localEntry || typeof localEntry !== 'object') continue;
      const cloudEntry = merged[date];
      if (!cloudEntry) {
        merged[date] = localEntry;
        continue;
      }
      const tasks = new Map();
      for (const task of [...(localEntry.tasks || []), ...(cloudEntry.tasks || [])]) {
        if (task?.id) tasks.set(task.id, task);
      }
      merged[date] = {
        ...localEntry,
        ...cloudEntry,
        tasks: [...tasks.values()],
        notes: cloudEntry.notes || localEntry.notes || ''
      };
    }
    merged.subtitle = cloud?.subtitle || local?.subtitle || '';
    return merged;
  };

  const persist = async payload => {
    if (!user) return;
    const snapshot = serialize(payload);
    const { error } = await client.from('planner_data').upsert({
      user_id: user.id,
      payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) {
      pendingPayload = payload;
      setStatus('Belum tersinkron. Periksa koneksi lalu coba lagi.');
      return;
    }
    lastPayload = snapshot;
    if (pendingPayload && serialize(pendingPayload) === snapshot) pendingPayload = null;
    setStatus('Tersinkron ke akun ini.');
  };

  const scheduleSave = payload => {
    if (!user) return;
    pendingPayload = payload;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(payload), 450);
  };

  const applyCloudPayload = payload => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const snapshot = serialize(payload);
    if (snapshot === lastPayload) return;
    clearTimeout(saveTimer);
    pendingPayload = null;
    window.plannerDataBridge.applyRemote(payload);
    lastPayload = snapshot;
    setStatus('Agenda diperbarui dari perangkat lain.');
  };

  const pull = async () => {
    if (!user || document.visibilityState === 'hidden') return;
    const { data, error } = await client.from('planner_data')
      .select('payload, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) return;
    if (data?.payload) applyCloudPayload(data.payload);
  };

  const connectUser = async nextUser => {
    if (!nextUser || user?.id === nextUser.id) return;
    if (channel) await client.removeChannel(channel);
    user = nextUser;
    form.hidden = true;
    signOutButton.hidden = false;
    setStatus(`Mengambil agenda untuk ${user.email || 'akun ini'}…`);

    const local = window.plannerDataBridge.getData();
    const { data: row, error } = await client.from('planner_data')
      .select('payload').eq('user_id', user.id).maybeSingle();
    if (error) {
      setStatus('Gagal membaca agenda cloud. Periksa pengaturan Supabase.');
      return;
    }
    if (row?.payload) {
      const merged = mergeInitialData(local, row.payload);
      const differs = serialize(merged) !== serialize(row.payload);
      window.plannerDataBridge.applyRemote(merged);
      lastPayload = serialize(merged);
      setStatus('Agenda tersinkron.');
      if (differs) await persist(merged);
    } else {
      await persist(local);
    }

    channel = client.channel(`planner-data-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'planner_data', filter: `user_id=eq.${user.id}`
      }, payload => {
        if (payload.new?.payload) applyCloudPayload(payload.new.payload);
      })
      .subscribe(state => {
        if (state === 'SUBSCRIBED') setStatus('Tersinkron ke akun ini.');
      });
    clearInterval(pollTimer);
    pollTimer = setInterval(pull, 15000);
  };

  window.addEventListener('planner:data-changed', event => scheduleSave(event.detail));
  document.addEventListener('visibilitychange', pull);
  window.addEventListener('focus', pull);
  window.addEventListener('online', () => {
    if (user && pendingPayload) persist(pendingPayload);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus('Sedang masuk…');
    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(), password: passwordInput.value
    });
    if (error) {
      setStatus(error.message || 'Tidak bisa masuk. Periksa email dan kata sandi.');
      return;
    }
    passwordInput.value = '';
    await connectUser(data.user);
  });

  createButton.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    setStatus('Membuat akun…');
    const { data, error } = await client.auth.signUp({
      email: emailInput.value.trim(), password: passwordInput.value,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    if (error) {
      setStatus(error.message || 'Akun belum bisa dibuat. Periksa email dan kata sandi.');
      return;
    }
    passwordInput.value = '';
    if (data.session && data.user) await connectUser(data.user);
    else setStatus('Akun dibuat. Buka email konfirmasi, lalu masuk di sini.');
  });

  signOutButton.addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await client.auth.signOut();
    if (channel) await client.removeChannel(channel);
    clearInterval(pollTimer);
    user = null;
    channel = null;
    form.hidden = false;
    signOutButton.hidden = true;
    setStatus('Keluar. Agenda ini tersimpan di perangkat.');
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session?.user) connectUser(data.session.user);
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) setTimeout(() => connectUser(session.user), 0);
  });
})();
