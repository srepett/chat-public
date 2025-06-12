    // api/index.js

    const express = require('express');
    const http = require('http');
    const socketIo = require('socket.io');
    const path = require('path');

    const app = express();
    // Pada Vercel, serverless function dijalankan per request,
    // sehingga membuat server HTTP dan Socket.IO seperti ini
    // tidak akan mempertahankan koneksi WebSocket jangka panjang.
    // Ini hanya menunjukkan struktur, tetapi fungsionalitas real-time
    // untuk chat kemungkinan besar tidak akan bekerja seperti yang diharapkan.
    const server = http.createServer(app);
    const io = socketIo(server);

    // Objek untuk menyimpan username setiap soket yang terhubung
    // Catatan: Karena serverless functions stateless,
    // objek 'users' ini akan di-reset setiap kali fungsi dipanggil,
    // sehingga tidak akan mempertahankan daftar pengguna antar request/koneksi.
    const users = {};

    // Ini adalah bagian penting untuk serverless function.
    // Fungsi ini akan diekspor dan dijalankan oleh Vercel.
    module.exports = async (req, res) => {
        // Ini adalah cara untuk "menginisialisasi" Socket.IO di lingkungan serverless.
        // Namun, perlu diingat bahwa ini tidak menciptakan server Socket.IO
        // yang terus-menerus berjalan untuk mempertahankan koneksi.
        // Setiap request baru akan memicu eksekusi ulang bagian ini.
        if (!res.socket.server.io) {
            console.log('Socket.IO is initializing...');
            io.attach(res.socket.server); // Lampirkan Socket.IO ke server HTTP yang sedang berjalan (sementara)
            res.socket.server.io = io; // Simpan instance io di socket server agar bisa diakses di request berikutnya
        }

        const currentIo = res.socket.server.io;

        // Event listener untuk koneksi Socket.IO
        // Ini akan terpicu setiap kali koneksi baru (atau upaya koneksi) dibuat,
        // tetapi koneksi itu sendiri mungkin tidak persisten.
        currentIo.on('connection', (socket) => {
            console.log('Pengguna terhubung:', socket.id);

            // --- Bagian Login/Username ---
            socket.on('set username', (username) => {
                // Karena 'users' akan di-reset, ini tidak akan mencegah duplikasi username
                // secara efektif di lingkungan multi-instance/serverless.
                if (username && !Object.values(users).includes(username)) {
                    users[socket.id] = username;
                    console.log(`Username ${username} diatur untuk ${socket.id}`);
                    socket.emit('username set', username);
                    currentIo.emit('chat message', {
                        username: 'Sistem',
                        message: `${username} telah bergabung ke chat. (Mungkin tidak real-time di Vercel)`,
                        timestamp: new Date().toLocaleTimeString('id-ID')
                    });
                    currentIo.emit('user list', Object.values(users));
                } else {
                    socket.emit('username error', 'Username sudah digunakan atau tidak valid.');
                }
            });

            // --- Bagian Chat ---
            socket.on('chat message', (msg) => {
                const username = users[socket.id];
                if (username) {
                    const chatMessage = {
                        username: username,
                        message: msg,
                        timestamp: new Date().toLocaleTimeString('id-ID')
                    };
                    console.log(`${username}: ${msg}`);
                    // Kirim pesan ke semua klien yang terhubung (upaya broadcast)
                    currentIo.emit('chat message', chatMessage);
                }
            });

            // Event saat pengguna terputus
            socket.on('disconnect', () => {
                const username = users[socket.id];
                if (username) {
                    console.log('Pengguna terputus:', username, '(', socket.id, ')');
                    currentIo.emit('chat message', {
                        username: 'Sistem',
                        message: `${username} telah meninggalkan chat.`,
                        timestamp: new Date().toLocaleTimeString('id-ID')
                    });
                    delete users[socket.id];
                    currentIo.emit('user list', Object.values(users));
                }
            });
        });

        // Teruskan request HTTP yang masuk ke aplikasi Express
        // ini penting agar Socket.IO memiliki 'handler' HTTP dasar
        app(req, res);
    };

    // Bagian ini hanya untuk pengujian lokal dengan 'node api/index.js'
    // Ini tidak akan aktif saat dideploy ke Vercel sebagai serverless function.
    if (process.env.NODE_ENV !== 'production') {
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server lokal berjalan di http://localhost:${PORT}`);
        });
    }
    
