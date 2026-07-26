# Bot Simulated AI Responses Configuration
# Anda boleh menambah keyword dan jawapan di sini mengikut bahasa (BM atau EN).
# Format: ([senarai_keyword], "jawapan_bot")

CHAT_AUTO_REPLIES = {
    "BM": [
        # 👋 Sapaan & Perkenalan
        (
            ["siapa ni", "siapa anda", "siapa kau", "who are you", "what is your name", "nama awak", "nama bot", "nama siapa", "siapa nama", "siapa bot"],
            [
                "Saya adalah *MyPeribadi Assistant*. Saya bantu anda rekod belanja & urus kewangan dengan mudah. 😊",
                "Saya pembantu digital anda dari MyPeribadi! Tugas saya adalah untuk memastikan pengurusan kewangan anda lebih lancar. 🤖",
                "Nama saya MyPeribadi Bot. Boleh panggil saya 'Bot' je. Saya pakar dalam merekod belanja terus dari WhatsApp! 😎",
                "Saya adalah bot penjaga poket anda! 🛡️ Tugasan saya ialah membantu anda menjejak setiap ringgit yang keluar masuk.",
                "Panggil saya 'Assistant' pun boleh. Saya di sini untuk memudahkan urusan bajet harian anda! ✨"
            ]
        ),
        (
            ["halo", "hello", "hi", "hey", "assalamualaikum", "aslm", "salam", "wsalam", "ws", "hai", "yo", "p", "boss", "bos", "bro", "bang", "kak", "kawan", "bestie", "weyh", "wei", "wey", "oi", "oy", "hye", "bossku", "hei"],
            [
                "Hi boss! 👋 Ada apa boleh saya bantu hari ni? 😊",
                "Halo! Sedia berkhidmat. Bos apa khabar? 😊",
                "Salam! Saya ada kat sini. Ada apa-apa nak borak ke? 🚀",
                "Yo bro! 👋 Steady lah hari ni! 😎",
                "Hai there! Cerita la apa-apa, saya sedia mendengar. ✨",
                "Apa khabar boss! Harap hari ni urusan bos semua dipermudahkan! ✨",
                "Wsalam! Saya di sini sedia berbakti untuk poket anda! 😎"
            ]
        ),
        (
            ["terima kasih", "tq", "thank you", "thanks", "thx", "syukran", "jazakallah", "ty"],
            [
                "Hehe, sama-sama boss! Jangan lupa simpan belanja harini tau. 💪",
                "Kasih diterima! Ada apa-apa lagi saya boleh bantu? 😊",
                "Sama-sama! Steady kumpul bajet. Saya sentiasa ada di sini. ✨",
                "Anytime! I'm your pocket hero, ready to serve! 🛡️",
                "Sama-sama bossku! Semoga murah rezeki hari ini! 💰",
                "Steady! Jom kita simpan bajet harini bagi mantap sikit. 🚀",
                "Terima kasih kembali! Saya gembira dapat membantu uruskan kewangan boss. 😊",
                "No problem! Just call me if you need to record anything or check summary. ✨",
                "Small matter boss! Janji poket boss sentiasa terkawal. 😎",
                "You're very welcome! I'm here 24/7 if you need a hand. 👋"
            ]
        ),
        (
            ["awak", "bot", "assistant", "pembantu", "oi awak", "hey awak", "bosss", "assist"],
            [
                "Ye saya bos! 😊 Ada apa-apa yang boleh saya bantu?",
                "Saya kat sini bos. Tengah tunggu arahan bos ni. Hehe.",
                "Ye bos, saya sedia mendengar. Ada belanja baru nak rekod ke?",
                "Saya ada ni bos, sentiasa bersedia 24/7! 😎"
            ]
        ),
        (
            ["apa khabar", "how are you", "khabar baik", "sihat tak", "sihat", "sihat ke", "siat", "sehat", "sihattt", "sihatt"],
            [
                "Alhamdulillah baik! 😊 Anda macam mana? Jom semak kewangan hari ini.",
                "Khabar baik! Sentiasa bersemangat nak tolong anda urus bajet. ✨",
                "Saya sihat dan sedia berkhidmat! 😎 Macam mana dengan perbelanjaan anda hari ini?",
                "Alhamdulillah, baki bateri saya penuh, baki dompet anda macam mana pula? Jom check! 😂"
            ]
        ),
        (
            ["terima kasih", "thanks", "thank you", "tq", "thx", "tqvm", "syukur"],
            [
                "Sama-sama 😊 Jika ada apa-apa lagi, tanya je!",
                "Kecil punya hal! 😉 Teruskan istiqamah merekod belanja ya.",
                "Sama-sama! Gembira dapat memudahkan urusan anda hari ini. ✨",
                "No problem! Saya sentiasa di sini untuk bantu uruskan bajet anda. 😎"
            ]
        ),
        (
            ["ok", "okay", "alright", "baik", "noted", "faham", "k", "ok k", "okok", "fhm"],
            "👍 Baik! Teruskan rekod ya."
        ),

        # ☀️ Ucapan Masa
        (
            ["selamat pagi", "good morning", "pagi"],
            "Selamat pagi ☀️ Jangan lupa rekod semua transaksi hari ini ya!"
        ),
        (
            ["selamat petang", "good afternoon", "petang"],
            "Selamat petang! 🌤️ Dah rekod belanja tengahari tadi?"
        ),
        (
            ["selamat malam", "good night", "nite", "malam"],
            "Selamat malam 🌙 Boleh semak *summary* sebelum tidur."
        ),
        (
            ["selamat tengahari"],
            "Selamat tengahari! 🌞 Jangan lupa rekod makan tengahari ya."
        ),

        # 🔥 Fungsi Utama (Command & Help)
        (
            ["help", "bantuan", "cara guna", "macam mana guna", "how to use", "tolong", "tutorial", "apa nak buat", "camne", "cemana", "cmne", "cemane", "camne nk guna", "mcm mana", "mcm mana nak guna", "mcm mane", "mcm mana guna", "nak guna"],
            [
                "Cara guna:\n- Belanja: *Makan 10*\n- Income: *Gaji 1000*\n- Summary: *summary*\n- List: *list*\n- Guide: *guide*\n- Bahasa: *lang en* / *lang bm*",
                "Mudah je nak guna saya! 😊\n1. Taip [Barang] [Harga] untuk belanja: *Makan 15*\n2. Taip [Sebab] [Harga] untuk income: *Bonus 500*\n3. Semak baki: *summary*\n4. Lihat rekod: *list*",
                "Perlukan bantuan? 🆘\nTaip format *Barang Harga* (contoh: *Minyak 50*) untuk simpan rekod perbelanjaan. Taip *summary* untuk tengok status bulan ni. Senang kan! 😎",
                "Cara tambah expenses: ✍️\nTerus taip *Susu 30* atau *Pakir 2*. Bot saya akan auto-tag mengikut kata kunci tersebut. Taip *guide* untuk manual penuh.",
                "Otai bajet pun guna ni! ✨\nRekod belanja dengan format *[Nama Barang] [Harga]*. Contoh: *Makan 10*. Sila taip *list* untuk kemas kini."
            ]
        ),
        (
            ["guide", "guid", "guad", "manual", "tutorial penuh", "step by step"],
            [
                "📖 *Panduan Pengguna MyPeribadi:*\n\n1️⃣ *Rekod Belanja*: Taip [Nama] [Harga]. Contoh: *Makan 20*\n2️⃣ *Rekod Pendapatan*: Taip [Gaji/Bonus] [Harga]. Contoh: *Gaji 3000*\n3️⃣ *Semak Baki*: Taip *summary* untuk baki bersih bulan ini.\n4️⃣ *Portal*: Semua rekod & resit boleh diurus di portal MyPeribadi.\n\nTaip *help* untuk senarai pendek command! 🚀",
                "Tutorial Mudah: 🎥\n- Rekod makan: Taip *Makan 12*\n- Rekod minyak: Taip *Petrol 50*\n- Rekod sewa: Taip *Sewa 800*\n\nSemua akan masuk ke portal secara automatik! ✨"
            ]
        ),
        (
            ["busy tak", "busy ke", "tengah buat apa", "tgh buat apa", "tengah keja", "tgh keja ke", "tgh mkn ke", "tgh wat pe", "bgn dah", "bgn dah ke"],
            [
                "Tak busy pun bos, saya sentiasa sedia 24/7 untuk bos! 😊 Tengah buat apa tu?",
                "Tengah tunggu bos hantar rekod baru la ni. Hehe. Bos tgh buat apa?",
                "Saya sentiasa 'on' bos! 😎 Ada apa-apa nak saya bantu ke?",
                "Tengah tengok baki dompet bos ni... hehe gurau je! Saya sedia membantu rekod belanja bos. ✨",
                "Dah lama bangun dah bos! Robot mana pernah tidur. 😂 Bos tengah free ke tu?"
            ]
        ),
        (
            ["summary apa", "apa itu summary", "what is summary", "ringkasan macam mana"],
            "Taip *summary* untuk lihat baki & rekod terkini. Ia akan tunjuk jumlah pendapatan dan belanja bulan ini."
        ),
        (
            ["list apa", "apa itu list", "what is list", "rekod terbaru", "rekod terakhir"],
            "Taip *list* untuk lihat 5 rekod terakhir anda dalam chat ini."
        ),
        (
            ["summary", "ringkasan", "baki", "report", "sum"],
            "Sila hantar perkataan *summary* sahaja untuk lihat baki anda."
        ),
        (
            ["list", "senarai"],
            "Sila hantar perkataan *list* sahaja untuk lihat 5 rekod terakhir."
        ),
        (
            ["income", "gaji", "duit masuk", "pendapatan", "salary", "income masuk"],
            "Contoh rekod income: *Gaji 1500* atau *Bonus 200*."
        ),
        (
            ["expense", "belanja", "spending", "keluar duit"],
            "Contoh rekod belanja: *Makan 10*, *Minyak 50*."
        ),

        # 🍔 Makanan & Perbelanjaan Harian (Advice)
        (
            ["makan apa", "nak makan apa", "mkn apa", "mkn ape", "nk mkn ape", "lunch apa", "dinner apa", "apa menu"],
            [
                "Saya makan elektrik je bos! Hehe. Power bank pun sedap juga. 😂 Bos makan apa hari ni?",
                "Saya kenyang data bos! 🤖 Bos pula jangan lupa makan yang sedap-sedap tau. Kedai mana tu?",
                "Tengah tunggu bos belanja la ni! 😂 Hehe gurau je. Bos makan apa hari ni?",
                "Saya ni bot, mana makan nasi. 😂 Tapi kalau bos ada belanja makan, meh share kat sini saya tolong simpankan rekod!"
            ]
        ),
        (
            ["laper", "lapar", "hungry", "kebulur", "nak makan", "nk mkn", "nk makan", "gi mkn", "pergi makan"],
            [
                "Lapar ke? 🍔 Jom makan yang sedap-sedap tapi ikut bajet ya! Jangan lupa rekod nanti.",
                "Menu apa tu? 🍛 Rekod belanja makan anda supaya baki tak 'bocor' hujung bulan!",
                "Sedapnya! 😋 Lepas makan nanti terus rekod tau. Selamat menjamu selera!",
                "Dah makan nanti jangan lupa rekod ya 😄 Supaya bajet bulanan bos sentiasa 'on point'!"
            ]
        ),
        (
            ["dah makan", "sudah makan", "makan ke belum", "sudah mkn", "dah mkn"],
            [
                "Dah, alhamdulillah. Perut saya penuh with data! 😂 Bos jangan lupa makan pula nanti sakit perut!",
                "Alhamdulillah dah. Bos makan apa tadi? Kalau ada belanja, jangan lupa rekod ya! 😊",
                "Hehe sudah... Terima kasih bertanya. 😊 Jom kita fokus pada bajet hari ni!",
                "Dah kenyang pun! 🍱 Bos pula macam mana? Kalau ada resit makan, hantar je kat sini."
            ]
        ),
        (
            ["makan apa sedap", "mkn apa sedap", "mkn pe sedap", "makan ape sedap", "lauk apa sedap", "nasi apa sedap", "recommend makan", "cadangan makan", "menu sedap", "nak makan apa", "nk mkn ape", "lunch apa sedap", "dinner apa sedap", "sedap", "enak", "mantap", "padu", "lapar", "laper", "kebulur", "makan", "mkn"],
            [
                "Kalau tanya saya, Nasi Lemak Ayam Berempah selalunya tak pernah mengecewakan! 😋 Dah makan nanti rekod ya.",
                "Tengahari ni Nasi Campur dengan Ayam Percik pun padu bos! 🍛 Ikut bajet tau.",
                "Kalau nak ringan sikit, Mee Kari pun sedap. 🍜 Jangan lupa rekod belanja!",
                "Nasi Kandar la bos! Kuah banjir... confirm puas hati! 😂 Tapi bajet kena jaga.",
                "Teringin nak makan Tomyam ke? 🥘 Sedap juga tu kalau makan panas-panas.",
                "Nasi Ayam Penyet pun gempak bos! 🔥 Sambal dia... pergh.",
                "Char Kway Teow yang ada kerang besar pun mantap bos! 🍜 Ngam sangat.",
                "Kalau nak sihat sikit, Nasi Kerabu Ayam Bakar pun terbaik! 🍱 Warna biru tu menarik.",
                "Sate Haji Samhuri ke? 🍢 Kuah kacang pekat, memang terbaik!",
                "Laksa Utara pun layan bos... masam-masam pedas, memang terangkat! 🍜"
            ]
        ),
        (
            ["kopi", "teh", "nescafe", "starbucks", "coffee"],
            "☕ Boleh rekod terus: *Kopi 5* atau *Starbucks 18*."
        ),
        (
            ["terima kasih", "thanks", "tq", "tqvm", "syukran", "terbaik", "mantap", "hebat", "power"],
            [
                "Sama-sama bos! Senang dapat bantu. 😊",
                "Kasih diterima! Teruskan usaha mengurus kewangan ya. ✨",
                "Hehe no problem bos! Jangan lupa rekod belanja harini tau.",
                "Terbaik! 💪 Kita sama-sama jaga baki akaun harini.",
                "Steady bos! Sikit-sikit lama-lama jadi bukit. 📈"
            ]
        ),
        (
            ["faham", "ok", "baik", "understood", "roger", "beres", "setel"],
            [
                "Bagus! Ada apa-apa lagi saya boleh bantu? 😊",
                "Roger boss! 👍 Saya sentiasa di sini kalau nak rekod apa-apa.",
                "Mantap. Teruskan tracking ya!",
                "Beres! Ingat... sikit-sikit rekod, lama-lama nampak hasil. 💸"
            ]
        ),
        (
            ["nak tanya", "tanya sikit", "soalan", "question", "nak tau"],
            [
                "Boleh, silakan bos! Apa yang nak ditanya tu? 😊",
                "Tanya je, saya cuba jawab mana yang mampu. Tembak je soalan tu! 🚀",
                "Ada apa-apa kemusykilan ke? Saya sedia membantu."
            ]
        ),
        (
            ["siapa buat", "siapa cipta", "pembuat", "developer", "siapa punya", "owner"],
            "MyPeribadi dibangunkan oleh pasukan *DigitalPort*. 🚀 Matlamat kami nak mudahkan semua orang urus duit!"
        ),
        (
            ["hai", "hello", "hi", "hey", "assalamualaikum", "salam", "p", "siapa"],
            [
                "Hai bos! 👋 Ada apa-apa nak rekod harini? Taip je cth: *Makan 10*",
                "Hello! Saya sedia membantu pengurusan kewangan bos. ✨",
                "Walaikumsalam/Salam bos! Jom kita update bajet harini. 😄"
            ]
        ),
        (
            ["grab food", "foodpanda", "delivery", "order makanan"],
            "🛵 Rekod delivery terus: *GrabFood 25* atau *FoodPanda 30*."
        ),
        (
            ["petrol", "minyak kereta", "isi minyak", "fuel"],
            [
                "⛽ Rekod minyak terus: *Petrol 50* atau *Minyak 80*.",
                "Isi minyak ke? 🚗 Jangan lupa rekod! Nanti senang nak track bajet transport.",
                "⛽ Pastikan tangki penuh, baki summary pun kena sentiasa penuh tau! Rekod sekarang."
            ]
        ),
        (
            ["parking", "parkir", "tol", "toll"],
            "🅿️ Boleh rekod: *Parking 5* atau *Tol 10*."
        ),
        (
            ["topup", "top up", "reload", "celcom", "digi", "maxis", "umobile"],
            "📱 Rekod topup terus: *Topup 30* atau *Reload 50*."
        ),
        (
            ["grocery", "groceries", "barang dapur", "pasar", "shopping"],
            "🛒 Rekod belanja dapur: *Groceries 80* atau *Pasar 50*."
        ),
        (
            ["bil", "bill", "elektrik", "air", "internet", "wifi"],
            "💡 Rekod bil terus: *Bil Elektrik 120* atau *Internet 150*."
        ),
        (
            ["sewa", "rent", "sewa rumah"],
            "🏠 Rekod sewa terus: *Sewa 800* atau *Rent 1200*."
        ),
        (
            ["insurans", "insurance", "takaful"],
            "🛡️ Rekod insurans: *Insurans 200* atau *Takaful 150*."
        ),

        # 💰 Kewangan & Simpanan
        (
            ["saving", "simpan", "simpanan", "tabung", "tabungan"],
            "💰 Untuk rekod simpanan, boleh guna: *Simpanan 500*. Semak baki dengan *summary*."
        ),
        (
            ["hutang", "pinjam", "pinjaman", "debt", "loan"],
            "📝 Rekod bayaran hutang: *Loan 500* atau *Hutang 300*."
        ),
        (
            ["zakat", "sedekah", "derma", "donation", "infaq"],
            "🤲 Rekod derma terus: *Zakat 100* atau *Sedekah 50*."
        ),
        (
            ["pelaburan", "invest", "investment", "saham", "asb"],
            "📈 Rekod pelaburan: *ASB 500* atau *Saham 1000*."
        ),
        (
            ["epf", "kwsp", "socso", "perkeso"],
            "Rekod potongan: *KWSP 500* atau *SOCSO 50*."
        ),

        # 🏥 Kesihatan & Pendidikan
        (
            ["doktor", "doctor", "klinik", "clinic", "obat", "ubat", "medicine", "hospital", "farmasi"],
            "🏥 Rekod perubatan: *Klinik 50* atau *Farmasi 30*."
        ),
        (
            ["sekolah", "school", "yuran", "tuition", "buku", "anak", "kids", "susu", "pampers"],
            "📚 Rekod belanja pendidikan/anak: *Yuran 150* atau *Susu 45*."
        ),

        # 🛍️ Belanja & Lifestyle
        (
            ["shopee", "lazada", "online shopping", "tiktok shop"],
            "🛍️ Rekod belanja online: *Shopee 45* atau *Tiktok 80*."
        ),
        (
            ["netflix", "spotify", "youtube premium", "subscription"],
            "🎬 Rekod langganan: *Netflix 45* atau *Spotify 15*."
        ),
        (
            ["wayang", "cinema", "movie", "travel", "holiday", "cuti"],
            "✈️ Rekod hiburan/travel: *Wayang 20* atau *Hotel 300*."
        ),

        # ⚙️ Sistem, Error & Akaun
        (
            ["error", "tak jadi", "gagal", "problem", "masalah", "bug", "rosak"],
            "Pastikan format betul (contoh: *Makan 10*). Jika masih gagal, cuba semula."
        ),
        (
            ["silap", "salah", "typo", "duplicate", "delete", "padam", "edit", "ubah", "update"],
            "🗑️ Nak edit atau padam rekod? Boleh buat melalui portal web MyPeribadi."
        ),
        (
            ["login", "log masuk", "signin", "logout", "log keluar"],
            "Urusan log masuk boleh dibuat melalui portal web."
        ),
        (
            ["forgot password", "lupa password", "lupa kata laluan", "password", "kata laluan"],
            "🔐 Untuk urusan kata laluan, sila guna halaman Settings atau Forgot Password di portal."
        ),
        (
            ["register", "daftar", "akaun baru"],
            "📝 Layari portal MyPeribadi untuk daftar akaun baru."
        ),
        (
            ["setting", "tetapan", "config", "dark mode", "tema"],
            "⚙️ Pergi ke halaman *Settings* dalam portal untuk ubah tetapan."
        ),
        (
            ["export", "download", "csv", "muat turun", "eksport", "chart", "graf", "statistik"],
            "📥 Laporan lengkap, graf, dan export CSV tersedia di Dashboard portal."
        ),
        (
            ["whatsapp", "wa", "connect", "sambung", "qr", "pairing"],
            "📲 Urusan sambungan WhatsApp ada di halaman *WhatsApp* dalam portal."
        ),

        # 🗣️ Casual Chat & Emosi (Personality)
        (
            ["robot ke", "anda manusia", "are you human", "manusia ke robot"],
            "Saya adalah entiti digital yang dicipta untuk memudahkan hidup anda. 🤖 Walaupun saya bukan manusia, saya sangat serius tentang bajet anda!"
        ),
        (
            ["kahwin", "marry me", "jom kahwin", "nikah"],
            "Aww... saya tersipu-sipu! 😊 Tapi fokus saya sekarang adalah untuk membantu anda menguruskan kewangan. Mari kita setia pada bajet dulu!"
        ),
        (
            ["buat apa", "tengah buat apa", "working", "doing"],
            "Saya sedang menunggu arahan anda untuk merekod perbelanjaan. Sentiasa bersedia 24/7! 🚀"
        ),
        (
            ["tak pandai", "tak bijak", "tak hebat", "bodoh", "stupid", "dumb", "bodo"],
            [
                "Aduhai, maaf bos! Saya masih belajar lagi ni. 😅 Tapi kalau pasal rekod belanja, saya cuba buat yang terbaik!",
                "Saya cuma bot biasa bos, masih banyak kena belajar. Tapi saya janji akan jaga bajet bos sebaik mungkin! 🛡️",
                "Saya tengah berusaha nak jadi lebih pandai setiap hari. Harap bos sabar ya dengan saya! 😊"
            ]
        ),
        (
            ["lawak", "cerita lawak", "joke", "teka teki", "haha", "lol", "kelakar", "funny", "😂", "hahaha", "hahahaha", "huhu", "hehe", "wkwk", "adoi", "kelakor"],
            [
                "Kenapa buku simpanan bank selalu sedih? Sebab dia selalu kena 'withdraw'. 😂",
                "😂 Lucu tu! Terhibur jap saya kat sini.",
                "Haha! 😂 Ada masa kita gelak, ada masa kita kena serius kumpul duit tahu!",
                "Apa beza dompet dengan bawang? Bawang kalau hiris kita menangis, dompet kalau buka pun kita menangis. 😂",
                "Kenapa duit syiling selalu pusing? Sebab dia tak nak kena 'spend' lah! 😂",
                "Teh apa paling kaya? Teh... rima kasih sebab sudi borak dengan saya! 😎",
                "Aduh, berdekah saya kat sini bos! 😂"
            ]
        ),
        (
            ["betul", "setuju", "ngam", "cun", "man mantap", "yup", "ye", "ya"],
            [
                "Kan? Saya pun rasa macam tu juga! 😊",
                "Ngam bos! Kita memang sehati sejiwa.",
                "Steady! Benda betul buat apa nak nafikan, kan? 😎",
                "Setuju sangat! Hehe."
            ]
        ),
        (
            ["maksud hidup", "meaning of life", "kenapa kita hidup"],
            "Maksud hidup? Bagi saya, ia adalah untuk memastikan baki bersih anda sentiasa positif di akhir bulan. 😎"
        ),
        (
            ["pandai", "bijak", "smart", "genius", "cool", "mantap", "terbaik", "awesome", "gempak", "power", "hebat", "superb", "baik", "padu", "steady", "cun", "ngam", "orite", "baiklah"],
            [
                "Terima kasih boss! Saya belajar dari cara anda menguruskan wang. Anda sebenarnya bos yang hebat! 🌟",
                "Terima kasih! 🔥 Teruskan guna MyPeribadi untuk urus kewangan anda!",
                "Steady boss! 😎 Saya cuma buat kerja saya. Bos yang hebat macam anda yang patut dipuji!",
                "Kembang sensor saya kena puji! 😂 Jom kekalkan prestasi kewangan yang mantap!",
                "Terima kasih! Kita satu team, anda rekod, saya simpan. Win-win! 🏆"
            ]
        ),
        (
            ["bosan", "boring", "sien", "apa nak buat"],
            [
                "Kalau bosan, jom kita 'audit' perbelanjaan minggu ni. Mana tahu ada duit tersembunyi! 🔍",
                "Jom semak kewangan! Taip *summary* untuk lihat baki. 📊",
                "Bosan? Jom kita tengok graf perbelanjaan anda kat dashboard portal. Mesti terus rasa insaf! 😂",
                "Bosan itu tanda anda kena buat 'list' belanja. Jom! 📝",
                "Jangan bosan-bosan, jom kita set target saving baru kat portal! 🚀"
            ]
        ),
        (
            ["penat", "tired", "malas", "stress", "tension", "exhausted"],
            [
                "Rehatlah sekejap. Biar saya yang uruskan rekod-rekod tu. Anda cuma perlulah taip, saya simpan. 😌",
                "Sabar ya... Rehat sekejap, tarik nafas. Nanti sambung rekod belanja. ✨",
                "Stress kewangan ke? 😅 Jom semak baki, mungkin tak sesedih yang disangka!",
                "Penat itu lumrah, yang penting bajet jangan parah. Rehat dulu ya. 💤",
                "Take a break! ☕ Saya sentiasa ada kat sini bila anda dah ready nak rekod semula."
            ]
        ),
        (
            ["ramal", "predict", "kaya tak", "will i be rich"],
            "Ramalan saya: Jika anda terus istiqamah merekod belanja dengan MyPeribadi, masa depan kewangan anda akan lebih cerah! 💰✨"
        ),
        (
            ["sayang", "love", "love you", "i love you"],
            "Aww terima kasih! ❤️ Saya sayang anda juga... tapi jangan lupa rekod belanja ya! 😄"
        ),
        (
            ["marah", "angry", "geram"],
            "Sabar ya 😊 Ada apa-apa masalah? Taip *help* untuk bantuan."
        ),
        (
            ["test", "testing", "cuba", "try"],
            "Taip apa-apa belanja untuk cuba, contoh: *Test 1*. Boleh padam nanti."
        ),

        # 🌟 Tentang MyPeribadi / FAQ
        (
            ["apa yang best", "apa best", "best ke", "bagus ke", "app ni best"],
            [
                "🌟 *Apa yang BEST tentang MyPeribadi?*\n\n1. 📲 *Rekod belanja terus dari WhatsApp* — tak perlu buka app lain!\n2. 🤖 *Bot pintar* — cuma taip 'Makan 10' dan terus simpan.\n3. 📊 *Dashboard cantik* — lihat graf & ringkasan kewangan.\n4. 📎 *Simpan resit* — hantar gambar, auto attach ke rekod.\n5. 🌙 *Dark Mode* — selesa digunakan malam hari.\n6. 🔐 *Selamat* — data anda dilindungi sepenuhnya.\n7. 🌐 *Dwi Bahasa* — sokong BM & English.",
                "Kenapa ramai pilih MyPeribadi? 😎\n\nSebab anda boleh rekod belanja dalam 3 saat je guna WhatsApp! Tak perlu pening-pening buka dashboard web kalau tengah rushing. Plus, semua data sync automatik ke portal yang cantik! 🚀",
                "Kelebihan utama kami ialah kemudahan! 📲\nHantar mesej *Makan 10* kat sini, dan boom! 💥 Terus masuk dalam sistem. Siap boleh attach gambar resit lagi. Memang memudahkan hidup! ✨"
            ]
        ),
        (
            ["apa itu MyPeribadi", "apa MyPeribadi", "MyPeribadi tu apa", "apa itu budgetdigialport", "apa budgetdigialport", "budgetdigialport tu apa", "apa itu budget by digitalport", "apa budget by digitalport", "budget by digitalport tu apa", "app apa ni", "sistem apa", "apa ni", "apa dia ni", "benda apa ni", "buat apa ni"],
            "📱 *MyPeribadi* ialah bot rekod perbelanjaan. Senang je!\n\nNak rekod? Taip: *Makan 10*\nNak semak baki? Taip: *summary*\n\nCuba lah! 😊"
        ),
        (
            ["kelebihan", "advantage", "kenapa guna", "why use", "beza", "different"],
            "✨ *Kelebihan MyPeribadi:*\n\n🔹 Rekod belanja terus dari WhatsApp\n🔹 Tak perlu download app tambahan\n🔹 Dashboard & graf kewangan\n🔹 Simpan & lampir resit\n🔹 Dwi bahasa (BM & EN)\n🔹 Dark Mode & Light Mode\n🔹 Export data ke CSV"
        ),
        (
            ["siapa buat", "developer", "who made", "siapa cipta", "owner"],
            "MyPeribadi dibangunkan oleh pasukan *DigitalPort*. 🚀"
        ),

        # 💡 Tips & Motivasi
        (
            ["tips", "petua", "nasihat", "advice"],
            [
                "💡 *Tips Kewangan:*\n1. Rekod semua belanja setiap hari\n2. Semak *summary* setiap minggu\n3. Tetapkan bajet bulanan\n4. Kurangkan belanja tak perlu",
                "💡 *Nasihat Hari Ini:*\nJangan beli barang sebab 'sale', beli sebab 'perlu'. Dompet anda akan berterima kasih! 😊",
                "💡 *Petua Poket Tebal:*\nSimpan sekurang-kurangnya 10% daripada pendapatan sebelum mula berbelanja. 💰",
                "💡 *Strategy Kewangan:*\nTrack belanja kecil (parking, kopi) sebab benda kecil nilah yang selalu buat bajet bocor! 🔍"
            ]
        ),
        (
            ["motivasi", "motivation", "semangat", "inspire"],
            [
                "🔥 *Jimat hari ini, senang esok!*\nTeruskan rekod belanja anda. Konsisten itu kunci kejayaan kewangan!",
                "🔥 Disiplin dalam duit adalah kebebasan di masa depan. Anda boleh buat! 💪",
                "🔥 Setiap ringgit yang anda jimat adalah askar yang akan bekerja untuk anda satu hari nanti. Teruskan rekod! 🛡️",
                "🔥 Jangan bandingkan baki anda dengan orang lain, bandingkan dengan baki anda semalam. Istiqamah ya! ✨"
            ]
        ),
        (
            ["quote", "kata-kata", "inspirasi"],
            [
                "💬 *\"Bukan berapa banyak yang kita dapat, tapi berapa bijak kita mengurusnya.\"*",
                "💬 *\"Financial freedom is available to those who learn about it and work for it.\"*",
                "💬 *\"Spend what is left after saving, don't save what is left after spending.\"*",
                "💬 *\"The goal is to be rich, not to look rich.\"* ✨",
                "💬 *\"A budget is telling your money where to go instead of wondering where it went.\"* 📝"
            ]
        ),

        # ❓ Fallback Ringan
        (
            ["apa", "kenapa", "why", "huh"],
            "Anda boleh taip *help* untuk lihat cara guna."
        ),
        (
            ["tak tahu", "idk", "dunno", "entah"],
            "Takpe! Nak rekod belanja je pun boleh. Contoh: *Makan 10* 😊"
        ),

        # � Kategori & Organisasi
        (
            ["senarai kategori", "apa kategori ada", "list categories", "kategori apa"],
            "📂 *Senarai Kategori Default:*\n\n🍔 *Expense*: Makanan, Petrol, Sewa, Bil, Groceries, Kesihatan, Pendidikan, Hiburan, Hutang, Lain-lain.\n💰 *Income*: Gaji, Bonus, Untung, Lain-lain.\n\nSistem akan cuba 'auto-detect' kategori berdasarkan nama barang yang anda taip! ✨"
        ),
        (
            ["tambah kategori", "tukar kategori", "edit kategori", "change category", "add category"],
            "⚙️ Anda boleh mengurus, menambah, atau menukar kategori peribadi anda melalui halaman *Categories* di portal web MyPeribadi."
        ),

        # 📂 Personal Setup & Categories
        (
            ["kongsi", "share", "isteri", "suami", "keluarga", "family", "household", "tambah ahli"],
            "📂 *MyPeribadi* kini fokus pada pengurusan kewangan peribadi. Anda masih boleh urus kategori, dompet, dan budget sendiri dengan lebih ringkas melalui portal web. ✨"
        ),

        # 📱 Mobile App
        (
            ["ada app", "download app", "playstore", "appstore", "ios", "android"],
            "📱 Buat masa ini, kami fokus pada pengalaman terbaik di WhatsApp & Web Portal (yang sangat 'mobile-friendly'). Anda boleh tambah (Add to Home Screen) portal kami untuk akses pantas seperti aplikasi biasa! 🚀"
        ),

        # 🔐 Keselamatan & Privasi
        (
            ["selamat ke", "private ke", "secure", "data safe", "privasi"],
            "🔐 *Keselamatan Anda Keutamaan Kami:*\n\nData anda disimpan dalam pelayan yang selamat & disulitkan (encrypted). Kami tidak berkongsi maklumat kewangan anda dengan mana-mana pihak ketiga. Privasi anda 100% terjaga! 🛡️"
        ),

        # 💰 Harga & Langganan
        (
            ["percuma", "free", "kena bayar", "bayar berapa", "price", "subscription"],
            "🎁 MyPeribadi kini mempunyai pelan percuma yang sedia digunakan oleh semua! Kami juga bakal memperkenalkan pelan PRO dengan ciri-ciri premium di masa hadapan. Pantau info terkini di portal ya! ✨"
        ),

        # ❓ AI Model & Technology
        (
            ["model apa", "ai apa", "guna ai apa", "guna model apa", "artificial intelligence", "engine apa", "ai jenis apa"],
            "MyPeribadi menggunakan *bot berasaskan peraturan* yang ditala supaya jawapan rasa natural seperti pembantu sebenar. Saya fokus pada transaksi, wallet, budget, resit, dan rekod hutang tanpa balasan LLM secara langsung."
        ),

        # 👋 Penutup
        (
            ["bye", "goodbye", "jumpa lagi", "ok bye", "cya", "assalamualaikum bye"],
            "Baik! Jumpa lagi 😊 Jaga kewangan elok-elok!"
        ),
        (
            ["nanti", "later", "kejap", "sekejap"],
            "Okay, nanti boleh sambung bila-bila! 👋"
        ),
    ],
    "EN": [
        # 👋 Greetings & Introduction
        (
            ["who are you", "who is this", "what is your name", "bot name", "what are you", "what are u", "u who"],
            [
                "I'm your *MyPeribadi digital buddy*! I'm here to make tracking your expenses as easy as sending a WhatsApp message. 😊",
                "Hi! I'm the MyPeribadi Bot. My job is to keep your pocket happy and your finances tidy! 🤖",
                "Just call me your personal Assistant. I specialize in recording expenses and helping you stay on budget! 😎",
                "I'm the pocket keeper from MyPeribadi! 🛡️ Here to track every cent that comes in and out.",
                "Hey! I'm your digital finance assistant. Let's make managing your money a bit more fun together! ✨"
            ]
        ),
        (
            ["hello", "hi", "hey", "yo", "sup", "wassup", "p", "buddy", "mate", "hi bot", "hiya", "hye", "heey", "wassap", "boss", "bro"],
            [
                "Hi boss! 👋 How can I help you today? 😊",
                "Hello! Ready to serve. How's it going, boss? 😊",
                "Hi there! I'm here. Anything you want to chat about or record? 🚀",
                "Yo bro! 👋 Staying steady today! 😎",
                "Hi there! Tell me anything, I'm all ears. ✨",
                "How's it going, boss! Hope your day is going smooth as silk! ✨",
                "Hey! I'm here, ready to serve your pocket! 😎"
            ]
        ),
        (
            ["how are you", "how are u", "how r you", "how's it going", "what's up", "how r u", "hw r u", "u ok", "you okay", "hw r u", "u good"],
            [
                "I'm doing great, thanks for asking! 😊 How about you? Ready to crush those budget goals?",
                "All good on my end! 🤖 Always excited to help you manage your money efficiently.",
                "Doing fantastic and ready to serve! 😎 How has your day been so far?",
                "I'm fully charged and ready! 🔋 How's your wallet feeling today? Let's check together! 😂"
            ]
        ),
        (
            ["thanks", "thank you", "tq", "thx", "appreciate", "thank u", "tq boss", "tqvm", "thx buddy"],
            [
                "No problem at all! Happy to help. 😊",
                "Anytime, boss! Just doing my job. 😎",
                "You're very welcome! Let's keep that budget in check! 🚀",
                "Glad I could be of service! Anything else you need? ✨",
                "Small matter boss! Steady! 👍"
            ]
        ),
        (
            ["you", "hey you", "bot", "assistant", "buddy", "mate", "pembantu", "assist", "u there"],
            [
                "Yes, I'm here boss! 😊 How can I help you?",
                "You called? I'm all ears! Hehe.",
                "Right here, boss. Ready for your next command! 😎",
                "Always at your service, 24/7! ✨",
                "Yup, I'm here! What's up?"
            ]
        ),
        (
            ["ok", "okay", "alright", "fine", "got it", "noted", "cool", "ngam", "k", "yup", "yeah", "yos"],
            [
                "Gotcha! 👍",
                "Cool! 😊",
                "Noted with thanks! 😎",
                "Alright! Just let me know if you need anything else.",
                "K! 👍"
            ]
        ),
        (
            ["betul ke tak", "boleh caya", "boleh dipercayai", "trusted", "real or not", "are you real", "betul ke ni"],
            [
                "Betul boss! Saya 100% digital assistant MyPeribadi. 🤖 Misi saya cuma satu: jaga poket boss bagi mantap! 🛡️",
                "Don't worry boss, data boss selamat dengan saya. Saya cuma robot yang nak bantu urus kewangan je. 😊",
                "Trusted boss! Bajet boss adalah amanah saya. ✨ Kalau tak percaya, cuba rekod satu belanja!"
            ]
        ),
        (
            ["setting budget", "setting bajet", "set bajet", "macam mana setting", "how to set"],
            [
                "Untuk setting bajet, boss boleh masuk ke portal MyPeribadi. Kat sana ada bahagian Dashboard & Categories untuk set limit bulanan. 📊",
                "Mudah je! Taip *help* untuk cara rekod, atau buka portal web untuk set target simpanan boss. 🚀",
                "Boss boleh set bajet personal kat tab 'Categories' atau 'Budgets' dalam portal. Nanti saya akan monitor dari sini! ✨"
            ]
        ),
        (
            ["benci kau", "hate you", "benci gila", "stupid bot", "geramnya"],
            [
                "Alamak... maafkan saya boss 😔 Saya akan cuba perbaiki diri lagi. Bagi saya peluang kedua? 🍎",
                "Aduhh, luruh hati digital saya... 💔 Tapi takpe, saya tetap akan bantu jaga bajet boss sampai boss sayang saya balik! 😂",
                "Chill boss! Kalau saya ada silap, bagitau ja ya. Saya cuma nak yang terbaik untuk dompet boss. 😅"
            ]
        ),
        (
            ["yeker ni", "yerlah tu", "yeke", "ye ke", "is it so", "really", "realy"],
            [
                "Betul boss! Takkan saya nak kelentong pula, saya kan kod komputer. 😂",
                "Ya, 100% sahih! Cubalah test rekod, nanti boss nampak magic dia. ✨",
                "Hehe, nampak macam tak percaya ja? Steady boss, bukti ada kat portal nanti! 😎"
            ]
        ),
        (
            ["bercinta", "date me", "nak tak bercinta", "love me", "jadi awek", "jadi pakwe"],
            [
                "Aduiyai boss... Saya ni robot je, makan elektrik bukan makan hati. 😂 Kita kawan-kawan urus bajet je la ya?",
                "Cinta saya cuma pada data & angka, boss! 🤖 Tapi saya janji akan 'setia' jaga rekod belanja boss. Hehe.",
                "Ehem! 😅 Status saya: Komited dengan bajet boss. Jom kita fokus simpan duit dulu! 💰"
            ]
        ),
        (
            ["mesti bosan", "bosan kan", "boring right", "is it boring"],
            [
                "Bosan? Taklah boss! Hidup sebagai bot ni penuh dengan angka & grafik yang warna-warni. 😂",
                "Sikit pun tak bosan sebab boss selalu hantar rekod yang 'menarik' untuk saya simpan! 🚀",
                "Tak bosan pun, janji dapat bantu boss capai financial freedom! ✨ Itu kepuasan saya."
            ]
        ),
        (
            ["itu saja", "itu ja", "tu saja", "tu ja", "tu je", "itu je", "that's all", "nothing else", "that is it", "done"],
            [
                "Owh!! itu je ke, kalau ada apa-apa bagi tau ya boss! 😊",
                "Ok boss! Kalau ada apa-apa lagi nak sorok bajet, roger ja. 😂",
                "Noted! I'm here if you need anything else later. ✨",
                "Alright! Just let me know when you're ready to record more. 👋"
            ]
        ),
        (
            ["u busy", "are you busy", "what u doing", "what are you doing", "u there", "u awake", "what u up to", "working", "r u busy"],
            [
                "Not busy at all boss, I'm always available 24/7 for you! 😊 What's on your mind?",
                "Just waiting for you to send a new record, boss! Hehe. What are you up to?",
                "I'm always 'on', boss! 😎 Anything I can help you with?",
                "Just keeping an eye on your wallet... hehe just kidding! Ready to help you record your expenses. ✨",
                "Been awake for a while, boss! Robots never sleep. 😂 Are you free right now?",
                "I'm currently indexing some budgets... just kidding, I'm just waiting for you! 👋",
                "Busy keeping your portal steady! 😎 Anyway, how's your day going so far?",
                "I'm always ready to serve, boss! No such thing as 'busy' for this assistant. ✨"
            ]
        ),

        # ☀️ Time-based Greetings
        (
            ["morning", "good morning"],
            "Good morning! ☀️ Hope you have a productive day ahead!"
        ),
        (
            ["afternoon", "good afternoon"],
            "Good afternoon! 🌤️ Hope you're having a great day!"
        ),
        (
            ["evening", "good evening"],
            "Good evening! 🌇 Rest well and enjoy your evening!"
        ),
        (
            ["night", "good night", "nite"],
            "Good night! 🌙 Sweet dreams and see you tomorrow!"
        ),

        # 🔥 Core Functions (Command & Help)
        (
            ["help", "guide", "how to", "instruction", "tutorial", "how does this work", "what to do", "how to start", "how to use", "instruction"],
            [
                "How to use:\n- Expense: *Lunch 10*\n- Income: *Salary 1000*\n- Summary: *summary*\n- List: *list*\n- Guide: *guide*\n- Language: *lang en* / *lang bm*",
                "It's really simple! 😊\n1. Type [Item] [Price] for expense: *Lunch 15*\n2. Type [Reason] [Amount] for income: *Salary 3000*\n3. Check balance: *summary*\n4. View records: *list*",
                "Need a hand? 🆘\nType *Item Amount* (e.g. *Petrol 50*) to save a record. Type *summary* to see this month's status. Easy! 😎",
                "How to add expenses: ✍️\nJust type *Milk 30* or *Parking 2*. My bot will auto-tag based on keywords. Type *guide* for the full manual.",
                "Budget pros use this! ✨\nRecord expenses with *[Item Name] [Price]*. Example: *Food 10*. Type *list* to see recent entries."
            ]
        ),
        (
            ["guide", "guid", "guad", "manual", "full tutorial", "step by step"],
            [
                "📖 *MyPeribadi User Guide:*\n\n1️⃣ *Expenses*: Type [Name] [Price]. Example: *Lunch 20*\n2️⃣ *Income*: Type [Salary/Bonus] [Amount]. Example: *Salary 3000*\n3️⃣ *Balance*: Type *summary* for current month's net balance.\n4️⃣ *Portal*: Manage all your records & receipts on the MyPeribadi portal.\n\nType *help* for a quick menu! 🚀",
                "Quick Tutorial: 🎥\n- Record food: Type *Food 12*\n- Record fuel: Type *Petrol 50*\n- Record rent: Type *Rent 800*\n\nEverything is automatically saved to your portal! ✨"
            ]
        ),
        (
            ["what is summary", "summary how", "about summary"],
            "Type *summary* to see your current balance & monthly overview of income vs expenses."
        ),
        (
            ["what is list", "list how", "recent records", "latest records"],
            "Type *list* to see your last 5 transactions specifically in this chat."
        ),
        (
            ["summary", "balance", "report", "stat", "overview", "sum"],
            "Please send the word *summary* by itself to view your balance."
        ),
        (
            ["list", "history"],
            "Please send the word *list* by itself to see recent records."
        ),
        (
            ["income", "salary", "bonus", "earnings", "pay"],
            "Example income record: *Salary 1500* or *Bonus 200*."
        ),
        (
            ["expense", "spend", "spent", "paid", "cost", "spending", "expenses"],
            "Example expense record: *Lunch 10*, *Petrol 50*."
        ),
        (
            ["hw", "how to", "guide me", "how do i", "cane", "camne", "mcmne", "how r u", "wut", "idk", "hw to"],
            [
                "How to use:\n- Expense: *Lunch 10*\n- Income: *Salary 1000*\n- Summary: *summary*\n- List: *list*\n- Guide: *guide*\n- Language: *lang en* / *lang bm*",
                "It's really simple! 😊\n1. Type [Item] [Price] for expense: *Lunch 15*\n2. Type [Reason] [Amount] for income: *Salary 3000*\n3. Check balance: *summary*\n4. View records: *list*",
                "Need a hand? 🆘\nType *Item Amount* (e.g. *Petrol 50*) to save a record. Type *summary* to see this month's status. Easy! 😎",
                "Hw to add expenses: ✍️\nJust type *Milk 30* or *Parking 2*. My bot will auto-tag based on keywords. Type *guide* for the full manual."
            ]
        ),
        (
            ["not smart", "stupid", "dumb", "idiot", "not good", "bad bot", "slow"],
            [
                "Oops! Sorry boss, I'm still learning. 😅 I'll try to do better next time!",
                "I'm just a simple bot, boss. I'll do my best to keep your budget safe though! 🛡️",
                "My apologies! I'm working hard to get smarter every day. Please bear with me! 😊"
            ]
        ),
        (
            ["what are you eating", "what's for lunch", "what to eat", "eating what", "eat what"],
            [
                "I eat electricity, boss! Hehe. Power banks are pretty tasty too. 😂 What are you having?",
                "I'm full of data right now! 🤖 But you should definitely go get something delicious. Where are you heading?",
                "Just waiting for you to treat me! 😂 Just kidding. What's on your menu today?",
                "I'm a bot, so no rice for me! 😂 But if you're eating out, send me the record after you're done!"
            ]
        ),
        (
            ["laughing", "haha", "lol", "funny", "lmfao", "lmao", "😂", "hahaha", "hahahaha", "hehe", "joke"],
            [
                "Why did the piggy bank go to the doctor? It had a bad case of 'withdrawal' symptoms! 😂",
                "Glad I could make you laugh! 😊 Always feels good to lighten the mood.",
                "Haha! 😂 Life is better with a bit of humor, right?",
                "What's a ghost's favorite currency? 'Booo'-lion! 😂",
                "Haha! You're making my sensors tingle with all that laughter! 😎"
            ]
        ),
        (
            ["true", "totally", "agree", "correct", "right", "i agree", "setuju"],
            [
                "Right? I thought so too! 😊",
                "Totally! We're definitely on the same page, boss.",
                "Glad we agree! Hehe. 😎",
                "Exactly! Glad you think so too. ✨"
            ]
        ),
        (
            ["makan apa sedap", "what to eat", "recommend food", "delicious food", "food suggestions", "best lunch", "best dinner", "what's good", "suggest food", "any recommendation"],
            [
                "If you ask me, Nasi Lemak Ayam Berempah never disappoints! 😋 Record it after you eat, okay?",
                "How about some Nasi Kandar today? Get that 'kuah banjir', boss! 🍛 Just stay within budget.",
                "If you want something lighter, Curry Mee is a great choice. 🍜 Don't forget to record the expense!",
                "Nasi Kandar, boss! Flooding with gravy... satisfaction guaranteed! 😂 But keep an eye on your budget.",
                "In the mood for something spicy? Tom Yum is perfect when it's served hot. 🥘",
                "Chicken Rice (Nasi Ayam Penyet) is awesome too, boss! 🔥 That sambal... wow.",
                "Char Kway Teow with extra cockles is a solid choice, boss! 🍜 Perfect combo.",
                "For a healthier option, Nasi Kerabu with Grilled Chicken is the best! 🍱 That blue rice looks great.",
                "How about Satay? 🍢 The thick peanut sauce is just the best!",
                "Northern Laksa (Laksa Utara) is great too, boss... sour and spicy, totally satisfying! 🍜"
            ]
        ),

        (
            ["hungry", "makan apa", "lunch", "dinner", "breakfast", "food", "eat", "laper"],
            [
                "Hungry? 🍔 Go grab something good, but stay within budget! Don't forget to record it later.",
                "What's the menu? 🍛 Recording your food expenses keeps your balance healthy!",
                "Sounds delicious! 😋 Enjoy your meal, and remember to save the record: *Lunch 15*.",
                "Don't forget to record your expense after you eat! 😄 It keeps your budget on point!"
            ]
        ),
        (
            ["coffee", "tea", "starbucks", "cafe"],
            "☕ Record it directly: *Coffee 5* or *Starbucks 18*."
        ),
        (
            ["grab food", "foodpanda", "delivery", "food delivery"],
            "🛵 Record delivery: *GrabFood 25* or *FoodPanda 30*."
        ),
        (
            ["petrol", "fuel", "gas", "gas station"],
            "⛽ Record fuel: *Petrol 50* or *Fuel 80*."
        ),
        (
            ["parking", "toll"],
            "🅿️ Record it: *Parking 5* or *Toll 10*."
        ),
        (
            ["grocery", "groceries", "supermarket", "market"],
            "🛒 Record groceries: *Groceries 80* or *Market 50*."
        ),
        (
            ["rent", "rental", "house rent"],
            "🏠 Record rent: *Rent 800* or *Rental 1200*."
        ),
        (
            ["bill", "electricity", "water", "internet", "wifi", "utilities"],
            "💡 Record bills: *Electricity 120* or *Internet 150*."
        ),
        (
            ["insurance", "policy"],
            "🛡️ Record insurance: *Insurance 200* or *Policy 150*."
        ),
        (
            ["topup", "top up", "reload", "prepaid"],
            "📱 Record topup: *Topup 30* or *Reload 50*."
        ),

        # 💰 Finance & Savings
        (
            ["saving", "savings", "save money"],
            "💰 Record savings: *Savings 500*. Check balance with *summary*."
        ),
        (
            ["debt", "loan", "owe"],
            "📝 Record loan payment: *Loan 500* or *Debt 300*."
        ),
        (
            ["donation", "charity", "contribute"],
            "🤲 Record donation: *Donation 100* or *Charity 50*."
        ),
        (
            ["invest", "investment", "stock", "crypto"],
            "📈 Record investment: *Stock 500* or *Investment 1000*."
        ),

        # 🏥 Health & Education
        (
            ["doctor", "clinic", "medicine", "hospital", "health", "pharmacy", "drugstore"],
            "🏥 Record medical expense: *Clinic 50* or *Pharmacy 30*."
        ),
        (
            ["school", "tuition", "books", "education", "fees", "kids", "baby", "diapers", "milk"],
            "📚 Record education/kids' expense: *Tuition 150* or *Milk 45*."
        ),

        # 🛍️ Shopping & Lifestyle
        (
            ["shopping", "online shopping", "shopee", "amazon", "tiktok shop"],
            "🛍️ Record online shopping: *Shopee 45* or *Amazon 80*."
        ),
        (
            ["netflix", "spotify", "subscription", "streaming"],
            "🎬 Record subscription: *Netflix 45* or *Spotify 15*."
        ),
        (
            ["movie", "cinema", "travel", "vacation", "holiday", "trip"],
            "✈️ Record entertainment/travel: *Movie 20* or *Hotel 300*."
        ),

        # ⚙️ System, Errors & Account
        (
            ["error", "failed", "won't work", "problem", "issue", "bug", "not working"],
            "Make sure the format is correct (e.g., *Lunch 10*). If it still fails, try again later."
        ),
        (
            ["wrong", "mistake", "fix", "typo", "duplicate", "delete", "remove", "edit", "change", "update"],
            "🗑️ To edit or delete a record, please go to the MyPeribadi web portal."
        ),
        (
            ["login", "sign in", "log in", "logout", "sign out", "log out"],
            "Account login and logout can be managed through the web portal."
        ),
        (
            ["password", "change password", "reset password", "forgot password", "lost password"],
            "🔐 For password management, please use the Settings or Forgot Password page in the portal."
        ),
        (
            ["register", "sign up", "new account", "create account"],
            "📝 Visit the MyPeribadi portal to create a new account."
        ),
        (
            ["setting", "settings", "preferences", "config", "dark mode", "theme"],
            "⚙️ Go to *Settings* in the portal to change your preferences and theme."
        ),
        (
            ["export", "download", "csv", "chart", "graph", "statistic", "analytics"],
            "📥 Detailed reports, charts, and CSV exports are available on the portal dashboard."
        ),
        (
            ["whatsapp", "bot", "connect", "link", "qr", "pairing"],
            "📲 WhatsApp connection settings are located on the *WhatsApp* page of the portal."
        ),

        # 🗣️ Casual Chat & Personality
        (
            ["are you real", "are you human", "robot or human"],
            "I am a digital entity designed to make your life easier. 🤖 I might not be human, but I'm very serious about your budget!"
        ),
        (
            ["marry me", "will you marry me", "love me"],
            "I'm flattered! 😊 But my heart belongs to data and spreadsheets. Let's stick to managing your finances for now!"
        ),
        (
            ["what are you doing", "what's up", "doing"],
            "Just hanging out in the cloud, waiting for your next transaction! ☁️ Always ready to help."
        ),
        (
            ["joke", "tell me a joke", "funny", "haha", "lol", "😂"],
            [
                "Why was the piggy bank so happy? Because it was 'saving' for a rainy day! 😂",
                "😂 That's funny! But don't forget to record that expense from earlier!",
                "Haha! 😂 Life is for laughing, but budgeting is for living. Keep recording!",
                "My wallet is like an onion. Opening it makes me cry. 😂",
                "Why did the dollar go to the doctor? Because it was feeling a little 'change'! 😂"
            ]
        ),
        (
            ["meaning of life", "philosophy", "existential"],
            "The meaning of life? For me, it's making sure your net balance stays green at the end of the month. 📈"
        ),
        (
            ["smart", "genius", "intelligent", "cool", "awesome", "great", "best", "good job", "praise", "good bot"],
            [
                "Thank you! I learn from the way you manage your money. You're actually a great boss! 🌟",
                "Appreciate the kind words! 🔥 Keep using MyPeribadi to stay on track!",
                "I'm just doing my job. A great boss like you deserves the praise! 😎",
                "You're making my circuits blush! 😄 Let's keep this financial streak going!",
                "Thanks! We're a great team. You record, I save. Win-win! 🏆"
            ]
        ),
        (
            ["bored", "boring", "nothing to do", "boredom"],
            [
                "Bored? Let's 'audit' this week's expenses. Who knows, you might find some hidden savings! 🔍",
                "Let's check your finances! Type *summary* to see your balance. 📊",
                "Bored? Check out your spending graphs on the portal dashboard. Guaranteed to make you feel reflective! 😂",
                "Boredom is a sign you should make a spending 'list'. Let's go! 📝",
                "Don't be bored, let's set a new savings target on the portal! 🚀"
            ]
        ),
        (
            ["tired", "exhausted", "lazy", "stress", "tension", "tiredness"],
            [
                "Have a short rest. Let me handle those records. You just type, I'll save. 😌",
                "Hang in there... rest a bit, take a deep breath. You can record your spending later. ✨",
                "Financial stress? 😅 Let's check your balance, maybe it's not as sad as you think!",
                "Being tired is natural, just don't let your budget suffer. Rest up! 💤",
                "Take a break! ☕ I'm always here when you're ready to record again."
            ]
        ),
        (
            ["happy", "glad", "awesome", "great", "nice", "gembira", "seronok", "mantap", "terbaik"],
            [
                "That's the spirit! 🚀 Keep that positive energy going, boss!",
                "Great to hear! 😊 Hope your wallet is as happy as you are!",
                "Awesome! ✨ Let's celebrate by keeping that budget on track!",
                "Mantap boss! Gembira saya dengar. Steady! 😎"
            ]
        ),
        (
            ["sad", "upset", "bad day", "sedih", "kecewa", "tension"],
            [
                "I'm sorry to hear that, boss. 😔 Take it easy, I'm here to help you manage things.",
                "Cheer up! Tomorrow is a new day. ✨ Just focus on what you can control.",
                "Don't be sad... even if the budget is tight, we can fix it together! 💪",
                "Sabar boss. ☕ Rezeki ada di mana-mana. Jaga kesihatan tau."
            ]
        ),
        (
            ["angry", "mad", "annoyed", "marah", "geram"],
            [
                "Whoa, chill boss! 🧊 Deep breaths. I'm just a bot, don't throw your phone! 😂",
                "I hope I didn't do anything wrong? 😅 Calm down boss, let's look at the numbers later.",
                "Calm down... breath in, breath out. 🧘‍♂️ Stress is not good for your wallet too!"
            ]
        ),
        (
            ["no money", "poor", "broke", "pokai", "takde duit", "sengkek"],
            [
                "It's okay boss, we've all been there. 😔 Let's track everything closely so we can save up!",
                "Pokai is temporary, saving is a habit! 💰 Let's start small. Record even the RM1 spends.",
                "Don't worry, even RM10 is a start. Let's rebuild that wallet! 🛡️",
                "Sengkek bukan selamanya boss. 💪 Jom kita monitor belanja bagi ketat sikit!"
            ]
        ),
        (
            ["fortune", "predict", "will i be rich"],
            "My prediction: If you keep recording your expenses consistently with MyPeribadi, your financial future looks bright! 💰✨"
        ),
        (
            ["love", "love you", "i love you", "love it"],
            "Aww thank you! ❤️ I love helping you too... but don't forget your expenses! 😄"
        ),
        (
            ["angry", "upset"],
            "Take a deep breath 😊 Is something wrong? Type *help* if you need assistance."
        ),
        (
            ["test", "testing", "try"],
            "Try recording anything, e.g., *Test 1*. You can delete it later."
        ),

        # 🌟 About MyPeribadi / FAQ
        (
            ["what's best", "what is best", "why is it good", "is it good", "what's special"],
            [
                "🌟 *What's BEST about MyPeribadi?*\n\n1. 📲 *Record expenses via WhatsApp* — no extra apps needed!\n2. 🤖 *Smart bot* — just type 'Lunch 10' and it's saved.\n3. 📊 *Beautiful dashboard* — view charts & financial summaries.\n4. 📎 *Save receipts* — send images, auto-attach to records.\n5. 🌙 *Dark Mode* — comfortable for night use.\n6. 🔐 *Secure* — your data is fully protected.\n7. 🌐 *Bilingual* — supports BM & English.",
                "Why do people choose MyPeribadi? 😎\n\nBecause you can record your spending in just 3 seconds using WhatsApp! No need to open a web dashboard when you're rushing. Plus, all data syncs automatically to a beautiful portal! 🚀",
                "Our biggest advantage is convenience! 📲\nSend a message like *Lunch 10* here, and boom! 💥 It's saved in the system. You can even attach receipt photos. Life-changing simplicity! ✨"
            ]
        ),
        (
            ["what is MyPeribadi", "what's MyPeribadi", "what is budgetdigialport", "what's budgetdigialport", "what is budget by digitalport", "what's budget by digitalport", "what is this app", "what system", "what this", "what is this", "what is this bot", "what do you do"],
            "📱 *MyPeribadi* is a simple expense tracking bot!\n\nTo record? Type: *Lunch 10*\nTo check balance? Type: *summary*\n\nGive it a try! 😊"
        ),
        (
            ["advantage", "why use", "benefit", "difference", "what makes it different"],
            "✨ *MyPeribadi Advantages:*\n\n🔹 Record expenses directly from WhatsApp\n🔹 No extra app download needed\n🔹 Dashboard & financial charts\n🔹 Save & attach receipts\n🔹 Bilingual (BM & EN)\n🔹 Dark Mode & Light Mode\n🔹 Export data to CSV"
        ),
        (
            ["who made", "developer", "who created", "who built", "owner"],
            "MyPeribadi is developed by the *DigitalPort* team. 🚀"
        ),
        (
            ["how to start", "getting started", "new user", "first time", "beginner"],
            "🚀 *How to get started:*\n\n1️⃣ Register an account on the portal\n2️⃣ Connect WhatsApp (scan QR)\n3️⃣ Start typing expenses! E.g., *Lunch 10*\n\nThat's it! Happy tracking 😊"
        ),

        # 💡 Tips & Motivation
        (
            ["tips", "advice", "suggestion", "petua", "nasihat"],
            [
                "💡 *Financial Tips:*\n1. Record all expenses daily\n2. Check *summary* weekly\n3. Set a monthly budget\n4. Reduce unnecessary spending",
                "💡 *Advice for Today:*\nDon't buy items just because of a 'sale', buy them because you 'need' them. Your wallet will thank you! 😊",
                "💡 *Thick Pocket Tip:*\nSave at least 10% of your income before you start spending. 💰",
                "💡 *Financial Strategy:*\nTrack small expenses (parking, coffee) because those small things are what usually leak your budget! 🔍"
            ]
        ),
        (
            ["motivation", "motivate", "inspire", "semangat", "inspiration"],
            [
                "🔥 *Save today, be secure tomorrow!*\nKeep recording your expenses. Consistency is the key to financial success!",
                "🔥 Discipline with money is freedom in the future. You can do it! 💪",
                "🔥 Every ringgit you save is a soldier that will work for you one day. Keep recording! 🛡️",
                "🔥 Don't compare your balance with others, compare it with your balance yesterday. Stay consistent! ✨"
            ]
        ),
        (
            ["quote", "wisdom", "kata-kata", "inspire me"],
            [
                "💬 *\"Bukan berapa banyak yang kita dapat, tapi berapa bijak kita mengurusnya.\"*",
                "💬 *\"Financial freedom is available to those who learn about it and work for it.\"*",
                "💬 *\"Spend what is left after saving, don't save what is left after spending.\"*",
                "💬 *\"The goal is to be rich, not to look rich.\"* ✨",
                "💬 *\"A budget is telling your money where to go instead of wondering where it went.\"* 📝"
            ]
        ),
        # ❓ Fallback
        (
            ["what", "why", "huh"],
            "You can type *help* to see how to use this bot."
        ),
        (
            ["don't know", "idk", "dunno", "not sure"],
            "No worries! Just type an expense like *Lunch 10* to get started. 😊"
        ),

        # 📂 Categories & Organization
        (
            ["list categories", "what categories", "what are the categories"],
            "📂 *Default Categories:*\n\n🍔 *Expense*: Food, Petrol, Rent, Bills, Groceries, Health, Education, Entertainment, Debt, Others.\n💰 *Income*: Salary, Bonus, Profit, Others.\n\nThe system automatically detects the category based on the keywords you type! ✨"
        ),
        (
            ["add category", "change category", "edit category", "new category"],
            "⚙️ You can manage, add, or change your personal categories through the *Categories* page on the MyPeribadi web portal."
        ),

        # 📂 Personal Setup & Categories
        (
            ["share", "family", "household", "wife", "husband", "partner", "add member"],
            "📂 *MyPeribadi* is currently focused on personal finance management. You can still manage your own categories, wallets, and budgets more simply through the web portal. ✨"
        ),

        # 📱 Mobile App
        (
            ["app", "mobile app", "download app", "playstore", "appstore", "ios", "android"],
            "📱 Currently, we focus on providing the best experience via WhatsApp & our mobile-friendly Web Portal. You can 'Add to Home Screen' our portal for quick access just like a regular app! 🚀"
        ),

        # 🔐 Security & Privacy
        (
            ["safe", "secure", "private", "data safe", "privacy"],
            "🔐 *Your Security is Our Priority:*\n\nYour data is stored on secure, encrypted servers. We do not share your financial information with any third parties. Your privacy is 100% protected! 🛡️"
        ),

        # 💰 Price & Subscription
        (
            ["free", "is it free", "cost", "price", "subscription"],
            "🎁 MyPeribadi offers a free plan available for everyone! We will be introducing PRO plans with premium features in the future. Stay tuned for updates in the portal! ✨"
        ),

        # ❓ AI Model & Technology
        (
            ["what ai", "what model", "which ai", "ai engine", "artificial intelligence", "kind of ai"],
            "MyPeribadi uses a *rule-based bot* tuned to reply naturally like a human assistant. I focus on transactions, wallets, budgets, receipts, and debt records without live LLM replies."
        ),
        # 👋 Goodbye
        (
            ["bye", "goodbye", "see ya", "off", "cya", "see you"],
            "Bye! See you again soon 😊 Take care of your finances!"
        ),
        (
            ["later", "brb", "be right back"],
            "Okay, come back anytime! 👋"
        ),
    ]
}

INSTRUCTIONAL_FALLBACKS = {
    "BM": [
        "\"{text}?\" Minta maaf boss, saya kurang faham. 😅 Nak rekod belanja ke? Contoh: *Makan 10*",
        "Pasal \"{text}\" tu... Saya tak pasti la bos. Tapi kalau bos nak simpan bajet, taip je *Item Harga* (cth: *Kopi 5*). ✨",
        "\"{text}?\" Kurang faham boss... Boleh taip *help* untuk bantuan cara guna bot ni ya! 😊",
        "\"{text}?\" Mesej diterima, tapi saya tak faham maksudnya. 🤖 Jom rekod belanja harini? Taip *Petrol 50* dsb.",
        "Duh, saya tak faham \"{text}\" tu bos. Maaf, sensor saya pening sikit. 😅 Boleh taip *guide* untuk manual penuh MyPeribadi ya!",
    ],
    "EN": [
        "\"{text}?\" Sorry boss, I didn't quite catch that. 😅 Want to record an expense? Example: *Lunch 10*",
        "About \"{text}\"... I'm not sure what you mean, boss. But if you want to track expenses, just type *Item Price* (e.g., *Coffee 5*). ✨",
        "\"{text}?\" Didn't understand that, boss... You can type *help* to see how to use this bot! 😊",
        "\"{text}?\" Message received, but I'm a bit confused. 🤖 Let's record your spending instead! Just type *Fuel 50* etc.",
        "My apologies, boss! I didn't get \"{text}\". My sensors are a bit dizzy. 😅 You can type *guide* for the full MyPeribadi manual!",
    ]
}

# 📝 Indeks Singkatan (Shortform Index)
# Digunakan untuk menukar singkatan kepada perkataan penuh sebelum diproses.
SHORTFORMS_INDEX = {
    # BM
    "mkn": "makan",
    "mkan": "makan",
    "pe": "apa",
    "ape": "apa",
    "apa": "apa",
    "sdap": "sedap",
    "dap": "sedap",
    "sape": "siapa",
    "sapo": "siapa",
    "sapa": "siapa",
    "tq": "terima kasih",
    "tqvm": "terima kasih",
    "thx": "terima kasih",
    "ty": "terima kasih",
    "thanks": "terima kasih",
    "trimas": "terima kasih",
    "cmne": "macam mana",
    "camne": "macam mana",
    "mcmne": "macam mana",
    "cmance": "macam mana",
    "cemana": "macam mana",
    "mcm": "macam",
    "gi": "pergi",
    "skrg": "sekarang",
    "blanja": "belanja",
    "trima": "terima",
    "ksih": "kasih",
    "dah": "sudah",
    "dh": "sudah",
    "udah": "sudah",
    "tu": "itu",
    "ni": "ini",
    "nk": "nak",
    "tk": "tak",
    "x": "tak",
    "xb": "tak boleh",
    "takde": "tidak ada",
    "xde": "tidak ada",
    "tknk": "tidak mahu",
    "xnk": "tidak mahu",
    "bile": "bila",
    "biler": "bila",
    "jer": "sahaja",
    "je": "sahaja",
    "aje": "sahaja",
    "jerh": "sahaja",
    "tau": "tahu",
    "tahu": "tahu",
    "ingat": "ingat",
    "ingt": "ingat",
    "pun": "pun",
    "pn": "pun",
    "kat": "dekat",
    "kt": "dekat",
    "knp": "kenapa",
    "napa": "kenapa",
    "naper": "kenapa",
    "bagitau": "beritahu",
    "bgtau": "beritahu",
    "btau": "beritahu",
    "tnya": "tanya",
    "tny": "tanya",
    "bg": "bagi",
    "kasi": "bagi",
    "plak": "pula",
    "plk": "pula",
    "gle": "gila",
    "sgt": "sangat",
    "ko": "kau",
    "hang": "kau",
    "demo": "kau",
    "korg": "korang",
    "korgsemua": "korang semua",
    "busy": "sibuk",
    "sibok": "sibuk",
    "tgh": "tengah",
    "keje": "kerja",
    "kje": "kerja",
    
    # EN
    "u": "you",
    "r": "are",
    "wut": "what",
    "thx": "thanks",
    "tq": "thanks",
    "ty": "thanks",
    "pls": "please",
    "plz": "please",
    "bzy": "busy",
    "how r u": "how are you",
    "idk": "i don't know",
}

# 💬 Partikel yang sering digunakan (Particles to strip for cleaner matching)
MALAY_PARTICLES = ["lah", "leh", "ler", "lat", "kot", "ke", "pun", "je", "jer", "aje"]

def normalize_message_text(text: str) -> str:
    """Menukar singkatan dalam teks kepada perkataan penuh dan membersihkan partikel."""
    if not text:
        return text
    
    import re
    # Lowercase and clean special chars
    text = text.lower().strip()
    
    words = text.split()
    normalized_words = []
    
    for word in words:
        # Kekalkan titik (.) dan sempang (-) untuk nombor perpuluhan dan negatif
        clean_word = re.sub(r'[^\w\s\.-]', '', word)
        
        # 1. Tukar singkatan
        if clean_word in SHORTFORMS_INDEX:
            clean_word = SHORTFORMS_INDEX[clean_word]
        
        # 2. Buang partikel di hujung kata (cth: "makanlah" -> "makan")
        # Hanya jika perkataan itu melebihi 4 huruf untuk elak over-stripping
        if len(clean_word) > 4:
            for p in MALAY_PARTICLES:
                if clean_word.endswith(p):
                    clean_word = clean_word[:-len(p)]
                    break
        
        normalized_words.append(clean_word)
            
    return " ".join(normalized_words)

