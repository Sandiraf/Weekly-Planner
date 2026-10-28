# Menyiapkan sinkronisasi planner

Planner memakai Supabase Auth dan satu baris JSON per akun. Agenda tetap tersimpan di perangkat, lalu disalin ke cloud dan dikirim ke perangkat lain yang masuk dengan akun yang sama.

## 1. Buat project Supabase

1. Buka https://supabase.com/dashboard dan buat project baru.
2. Dari project tersebut, salin **Project URL** dan **publishable key** (atau `anon` key lama) dari pengaturan API.
3. Jangan gunakan atau bagikan `service_role`/secret key. Key di frontend memang bersifat publishable; akses tabel tetap dibatasi oleh RLS.

## 2. Buat tabel dan aturan akses

1. Buka **SQL Editor** di dashboard Supabase.
2. Salin seluruh isi `supabase-setup.sql`, jalankan sekali, dan pastikan muncul sukses.

SQL tersebut membuat tabel `planner_data`, membatasi tiap akun ke baris miliknya, dan mengaktifkan perubahan realtime untuk tabel itu.

## 3. Atur alamat verifikasi email

Di **Authentication → URL Configuration**, atur:

- Site URL: `https://sandiraf.github.io/Weekly-Planner/`
- Redirect URL yang diizinkan: `https://sandiraf.github.io/Weekly-Planner/`

## 4. Sambungkan key ke aplikasi

Isi `url` dan `key` di `supabase-config.js` dengan Project URL dan publishable/anon key dari langkah 1. Jangan isi dengan secret/service-role key.

Saat pertama kali masuk, data lokal perangkat tersebut disalin ke cloud. Perangkat lain perlu masuk dengan email dan kata sandi akun yang sama. Jika akun Supabase baru meminta verifikasi, buka email konfirmasi sebelum masuk.
