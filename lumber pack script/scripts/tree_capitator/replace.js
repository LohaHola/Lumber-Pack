/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌲 SISTEM PENEBANGAN POHON DENGAN COUNTDOWN KEAMANAN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Fitur Utama:
 *   1. Mode penebangan bertahap (4 fase progresif dengan countdown 10 detik)
 *   2. Mundur otomatis jika timeout (cascade mundur 5 detik per fase)
 *   3. Proteksi target switch (pohon berubah → regenerasi otomatis)
 *   4. Reduksi durability tool dengan dukungan enchantment Unbreaking
 *   5. Konversi item rtc: → minecraft: otomatis
 * 
 * Namespace Custom: rtc: (untuk log dan item khusus)
 * Sneak Required: Ya, break block harus dengan Ctrl (sneaking)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { world, system, ItemStack } from "./export";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 PENYIMPANAN DATA GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

// Map tracking countdown setiap blok
// Key: "x:y:z:namaPlayer" atau "x:y:z:namaPlayer:konversi" atau "x:y:z:namaPlayer:mundur"
const petaPerhitunganMundur = new Map();

// Map tracking pohon yang sedang dikerjakan per pemain
// Key: namaPlayer, Value: "x:y:z"
const petaPohonAktifPerPemain = new Map();

// Map tracking pemain yang sedang dalam countdown dengan status sneaking mereka
// Key: namaPlayer, Value: { namaPlayer, x, y, z, statusSneakingWaktuAwal }
const petaPemainDalamCountdown = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 FUNGSI HELPER LEVEL RENDAH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ✅ Validasi: Pastikan player sedang SNEAK
 * Dipanggil sebelum eksekusi apapun terkait penebangan
 * 
 * @param {Player} pemain - Objek pemain
 * @returns {boolean} true jika player sneak, false jika tidak
 */
function validatePlayerSneak(pemain) {
   // Jika player tidak sneak → return false (tidak valid)
   if (!pemain || !pemain.isValid || !pemain.isSneaking) {
      return false;
   }
   return true;
}



/**
 * 🔄 Konversi blok custom (rtc:) kembali ke vanilla minecraft (asli)
 * Digunakan saat: timeout countdown atau pemain switch pohon
 * 
 * @param {Dimension} dimensi - Dimensi tempat blok berada
 * @param {Vector3} lokasi - Posisi {x, y, z} blok
 * @param {string} idTipeBlok - ID blok yang akan dikonversi (rtc:oak_log, dll)
 */
function konversiKeVanila(dimensi, lokasi, idTipeBlok) {
   try {
      const { x, y, z } = lokasi;
      // Konversi: rtc: → minecraft:
      const tipeVanila = idTipeBlok
         .replace(/^rtc:/, "minecraft:")
         .replace(/_stem$/, "_log")
         .replace("_log", "_log");
      dimensi.runCommand(`setblock ${x} ${y} ${z} ${tipeVanila} destroy`);
   } catch (err) {
      console.warn(`❌ Konversi ke vanilla gagal: ${err}`);
   }
}

/**
 * 📊 Kembalikan blok ke state/fase sebelumnya sambil menjaga texture
 * Digunakan saat: countdown mundur atau cascade mundur
 * 
 * @param {Dimension} dimensi - Dimensi tempat blok berada
 * @param {Block} blok - Objek blok Minecraft
 * @param {string} idTipeBlok - ID tipe blok
 * @param {number} stateTarget - State yang dituju (1, 2, 3, atau 4)
 */
function konversiKeState(dimensi, blok, idTipeBlok, stateTarget) {
   try {
      // Gunakan setBlockPermutation agar texture tetap terjaga
      if (blok && stateTarget > 0) {
         const permutasiBaruBlok = blok.permutation.withState("log:state", stateTarget);
         dimensi.setBlockPermutation(blok.location, permutasiBaruBlok);
      }
   } catch (err) {
      console.warn(`❌ Konversi ke state ${stateTarget} gagal: ${err}`);
   }
}

/**
 * ⏹️ Hentikan countdown aktif dan bersihkan resourcenya
 * Dipanggil saat: timeout, switch pohon, atau final hit (state 4)
 * 
 * @param {string} kunciPerhitungan - Key unik countdown (x:y:z:namaPlayer:tipe)
 */
function hentikanPerhitungan(kunciPerhitungan) {
   if (petaPerhitunganMundur.has(kunciPerhitungan)) {
      const perhitungan = petaPerhitunganMundur.get(kunciPerhitungan);
      if (perhitungan.idTimer !== null) {
         system.clearRun(perhitungan.idTimer);
      }
      petaPerhitunganMundur.delete(kunciPerhitungan);
   }
}

/**
 * 🛡️ Hentikan countdown karena pemain unsneak (proteksi serangan)
 * Dipanggil saat: pemain tidak lagi sneaking saat countdown fase 1-3
 * PERBEDAAN: Tidak mereset progres (state tetap), hanya stop countdown
 * 
 * Alasan: Mencegah player kehilangan progres jika diserang monster/terpaksa unsneak
 * 
 * @param {string} namaPlayer - Nama pemain
 * @param {Vector3} lokasi - Posisi {x, y, z} blok
 */
function hentikanCountdownKarenaSneakDihilangkan(namaPlayer, lokasi) {
   const { x, y, z } = lokasi;
   
   // Hapus semua countdown terkait blok ini (stop timer)
   hentikanPerhitungan(`${x}:${y}:${z}:${namaPlayer}:konversi`);
   hentikanPerhitungan(`${x}:${y}:${z}:${namaPlayer}`);
   hentikanPerhitungan(`${x}:${y}:${z}:${namaPlayer}:mundur`);
   
   // ✅ TIDAK regenerasi pohon ke vanilla
   // ✅ TIDAK reset state
   // ✅ HANYA stop countdown, progres tetap
   
   // Update tracking
   petaPemainDalamCountdown.delete(namaPlayer);
}

// ═══════════════════════════════════════════════════════════════════════════
// ⏱️ FUNGSI COUNTDOWN - SISTEM UTAMA KEAMANAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⏰ Buat countdown timer untuk blok dengan cascade mundur otomatis
 * 
 * Tiga mode tampilan:
 *   - 'konversi': Vanilla log → Custom log (1 bar, durasi 10s)
 *   - 'progres': Progres fase custom (dinamis bar, durasi 10s, auto mundur saat timeout)
 *   - 'mundur': Cascade mundur state (merah bar, durasi 5s, loop hingga vanilla)
 * 
 * @param {number} durasiDetik - Durasi countdown dalam detik (10 atau 5)
 * @param {Object} konfigurasi - Pengaturan countdown
 * @param {Block} konfigurasi.blok - Objek blok Minecraft
 * @param {Dimension} konfigurasi.dimensi - Dimensi tempat blok berada
 * @param {Player} konfigurasi.pemain - Objek pemain yang break block
 * @param {string} konfigurasi.kunciPerhitungan - Unique key countdown
 * @param {number} konfigurasi.stateSekarang - State blok saat ini (0-4)
 * @param {string} konfigurasi.modeTampilan - 'konversi'|'progres'|'mundur'
 * @param {boolean} [konfigurasi.mulaiBahasaanBaruMundur=true] - Auto cascade mundur
 */
function buatPerhitunganMundur(durasiDetik, konfigurasi) {
   const { 
      blok, 
      dimensi, 
      pemain, 
      kunciPerhitungan, 
      stateSekarang, 
      modeTampilan = 'progres', 
      mulaiBahasaanBaruMundur = true 
   } = konfigurasi;
   
   // Hentikan countdown lama jika ada dengan kunci yang sama
   hentikanPerhitungan(kunciPerhitungan);
   
   let waktuTersisa = durasiDetik;
   let penghitungTick = 0;
   let sedangProsesTimeout = false;
   
   const idTimer = system.runInterval(() => {
      // Guard clause: cegah ghost timer setelah timeout
      if (sedangProsesTimeout) {
         system.clearRun(idTimer);
         return;
      }
      
      // ✅ CRITICAL: VALIDASI SNEAK SETIAP TICK
      // Jika phase 1-3 (progres) atau phase 0 (konversi) dan player unsneak
      // → NOTIFIKASI SAJA, timer tetap jalan
      if ((modeTampilan === 'progres' || modeTampilan === 'konversi') && !validatePlayerSneak(pemain)) {
         // Player UNSNEAK terdeteksi!
         // → Timer tetap jalan (progres tidak reset)
         // → Player harus sneak kembali sebelum timeout
         // → Jika timeout, cascade mundur otomatis
         
         // NOTIFIKASI PEMAIN
         pemain.onScreenDisplay.setActionBar("§6⚠ Unsneak! Timer tetap jalan, sneak cepat untuk progres!");
         // Skip dan lanjut countdown
      }
      
      penghitungTick++;
      
      // Update tampilan setiap 20 tick (1 detik real-time)
      if (penghitungTick % 20 === 0) {
         waktuTersisa--;
         
         // Ambil state ACTUAL dari blok (bukan dari variable yang bisa stale)
         const stateAktual = blok.permutation.getState("log:state");
         
         // ┌─────────────────────────────────────────────────────┐
         // │ BANGUN TAMPILAN UI ACTION BAR                       │
         // │ Format: [Progress Bar] [Mode Text] [Countdown]      │
         // └─────────────────────────────────────────────────────┘
         
         let palangProgres, teksMode, warnaHitung;
         
         if (modeTampilan === 'konversi') {
            // Konversi: bar tetap 1 penuh, warna hijau
            palangProgres = "§a█§7░░░░";
            teksMode = "§eKONVERSI§r";
            warnaHitung = waktuTersisa <= 3 ? "§c" : "§e";
            
         } else if (modeTampilan === 'mundur') {
            // Mundur: bar merah dinamis sesuai state actual
            palangProgres = "§c" + "█".repeat(stateAktual) + "§7" + "░".repeat(4 - stateAktual);
            teksMode = "§6MUNDUR§r";
            warnaHitung = waktuTersisa <= 3 ? "§4" : "§6";
            
         } else {
            // Progres: bar hijau dinamis sesuai state actual
            palangProgres = "§a" + "█".repeat(stateAktual) + "§7" + "░".repeat(4 - stateAktual);
            teksMode = "";
            warnaHitung = waktuTersisa <= 3 ? "§c" : "§e";
         }
         
         const teksHitung = `${warnaHitung}⏱ ${waktuTersisa}s§r`;
         
         // Tampilkan di action bar
         pemain.onScreenDisplay.setActionBar(`${palangProgres} ${teksMode} ${teksHitung}`);
      }
      
      // ┌─────────────────────────────────────────────────────┐
      // │ HANDLE TIMEOUT (waktu habis)                        │
      // └─────────────────────────────────────────────────────┘
      if (waktuTersisa <= 0) {
         sedangProsesTimeout = true;
         system.clearRun(idTimer);
         petaPerhitunganMundur.delete(kunciPerhitungan);
         
         // REMOVE pemain dari monitoring unsneak (countdown selesai)
         petaPemainDalamCountdown.delete(pemain.name);
         
         // Ambil state actual saat timeout
         const stateAktual = blok.permutation.getState("log:state");
         
         if (modeTampilan === 'konversi') {
            // ╔═══════════════════════════════════════════════════╗
            // ║ TIMEOUT KONVERSI: Kembali ke vanilla             ║
            // ╚═══════════════════════════════════════════════════╝
            konversiKeVanila(dimensi, blok.location, blok.typeId);
            pemain.onScreenDisplay.setActionBar("§c❌ Terlalu lama! Kembali ke pohon awal");
            pemain.playSound("random.break");
            
         } else if (modeTampilan === 'progres') {
            // ╔═══════════════════════════════════════════════════╗
            // ║ TIMEOUT PROGRES: Mundur 1 state + cascade mundur  ║
            // ╚═══════════════════════════════════════════════════╝
            if (stateAktual === 1) {
               konversiKeVanila(dimensi, blok.location, blok.typeId);
               pemain.onScreenDisplay.setActionBar("§c⚠ Terlalu lama! Kembali ke pohon awal");
            } else {
               konversiKeState(dimensi, blok, blok.typeId, stateAktual - 1);
               pemain.onScreenDisplay.setActionBar(`§6⚠ Mundur ke fase ${stateAktual - 1}!`);
            }
            pemain.playSound("random.break");
            
            // Auto start countdown mundur jika masih ada state sebelumnya
            if (mulaiBahasaanBaruMundur && stateAktual > 1) {
               system.run(() => {
                  const stateBaruAktual = blok.permutation.getState("log:state");
                  if (stateBaruAktual > 0) {
                     const kunciMundur = kunciPerhitungan + ":mundur";
                     buatPerhitunganMundur(5, {
                        blok, dimensi, pemain,
                        kunciPerhitungan: kunciMundur,
                        stateSekarang: stateBaruAktual,
                        modeTampilan: 'mundur',
                        mulaiBahasaanBaruMundur: true
                     });
                  }
               });
            }
            
         } else if (modeTampilan === 'mundur') {
            // ╔═══════════════════════════════════════════════════╗
            // ║ TIMEOUT MUNDUR: Mundur lagi (cascade continue)    ║
            // ╚═══════════════════════════════════════════════════╝
            const stateBerikut = stateAktual > 1 ? stateAktual - 1 : 0;
            
            if (stateBerikut === 0) {
               konversiKeVanila(dimensi, blok.location, blok.typeId);
               pemain.onScreenDisplay.setActionBar("§c❌ Kembali ke pohon awal!");
               // REMOVE dari monitoring (cascade selesai)
               petaPemainDalamCountdown.delete(pemain.name);
            } else {
               konversiKeState(dimensi, blok, blok.typeId, stateBerikut);
               pemain.onScreenDisplay.setActionBar(`§c❌ Mundur lagi ke fase ${stateBerikut}!`);
               
               // Auto cascade mundur terus
               if (mulaiBahasaanBaruMundur) {
                  system.run(() => {
                     const stateBaruAktual = blok.permutation.getState("log:state");
                     if (stateBaruAktual > 0) {
                        const kunciMundur = kunciPerhitungan + ":mundur";
                        buatPerhitunganMundur(5, {
                           blok, dimensi, pemain,
                           kunciPerhitungan: kunciMundur,
                           stateSekarang: stateBaruAktual,
                           modeTampilan: 'mundur',
                           mulaiBahasaanBaruMundur: true
                        });
                     }
                  });
               }
            }
            pemain.playSound("random.break");
         }
         
         // REMOVE pemain dari monitoring (timeout fase konversi atau progres)
         if (modeTampilan !== 'mundur') {
            petaPemainDalamCountdown.delete(pemain.name);
         }
         return;
      }
   });
   
   // Simpan data countdown ke peta global
   petaPerhitunganMundur.set(kunciPerhitungan, {
      waktuTersisa,
      idTimer,
      idTipeBlok: blok.typeId,
      lokasi: blok.location,
      state: stateSekarang,
      modeTampilan
   });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 EVENT HANDLER UTAMA - SEBELUM PEMAIN BREAK BLOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔴 Daftarkan handler peristiwa: Sebelum pemain pecah blok
 * Trigger:
 *   1. Vanilla minecraft:log + sneaking → Konversi ke rtc: custom + countdown
 *   2. Custom rtc:log + sneaking + state < 4 → Progres ke state berikutnya + countdown
 * 
 * Fitur:
 *   - Proteksi target switch: Jika pemain switch pohon → regenerasi pohon lama
 *   - Reduksi durability: Kurangi durability tool (dengan Unbreaking support)
 *   - Partikel effect: 5 crop_dust_particle setiap hit
 *   - Sound effect: dig.wood dengan pitch yang meningkat
 */
world.beforeEvents.playerBreakBlock.subscribe((dataEvent) => {
   const { block, dimension, player } = dataEvent;
   const { x, y, z } = block.location;
   
   // Skip jika sudah pernah diproses (marker dinamis tc:x:y:z ada)
   if (world.getDynamicProperty(`tc:${x}:${y}:${z}`) !== undefined) return;

   const idTipeBlok = block.typeId;

   // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   // ┃ BAGIAN 1: VANILLA LOG → CUSTOM LOG CONVERSION             ┃
   // ┃ Trigger: minecraft:log + player sneaking                  ┃
   // ┃ Hasil: Konversi ke rtc:log + countdown konversi 10s      ┃
   // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

   if (idTipeBlok.startsWith("minecraft") && (idTipeBlok.endsWith("_stem") || idTipeBlok.endsWith("_log"))) {
      // ✅ VALIDASI SNEAK DI AWAL (CRITICAL)
      if (!validatePlayerSneak(player)) {
         return;  // ← Exit jika tidak sneak
      }
      
      // Validasi: Ada udara di bawah 1-2 block? (tidak floating log)
      const adaUdaraDiBawah =
         block.dimension.getBlock({ x: x, y: y - 2, z: z }).typeId === "minecraft:air" &&
         block.dimension.getBlock({ x: x, y: y - 1, z: z }).typeId === "minecraft:air";

      // Validasi: Ada blok log di atas? (bagian dari pohon yang valid)
      const adaLogDiAtas = [-1, 0, 1].some((dx) =>
         [-1, 0, 1].some((dz) => {
            const bBlok = block.dimension.getBlock({
               x: block.location.x + dx,
               y: block.location.y + 1,
               z: block.location.z + dz,
            });
            return bBlok && (bBlok.typeId.includes("log") || bBlok.typeId.includes("stem"));
         })
      );

      // Reject jika tidak valid pohon
      if (!adaLogDiAtas || (adaUdaraDiBawah && !idTipeBlok.endsWith("mangrove_log"))) return;

      system.run(() => {
         try {
            // Konversi ID: minecraft: → rtc:
            const idRTC = idTipeBlok.replace(/^minecraft:/, "rtc:").replace(/stripped_/g, "");
            const kunciPohonBaru = `${x}:${y}:${z}`;
            
            // ┌─────────────────────────────────────────────────────┐
            // │ PROTEKSI TARGET SWITCH                              │
            // │ Jika pemain switch pohon → regenerasi pohon lama    │
            // └─────────────────────────────────────────────────────┘
            if (petaPohonAktifPerPemain.has(player.name)) {
               const kunciPohonSebelumnya = petaPohonAktifPerPemain.get(player.name);
               
               if (kunciPohonSebelumnya !== kunciPohonBaru) {
                  const [pxSebelum, pySebelum, pzSebelum] = kunciPohonSebelumnya.split(":").map(Number);
                  const blokSebelumnya = dimension.getBlock({ x: pxSebelum, y: pySebelum, z: pzSebelum });
                  
                  if (blokSebelumnya && blokSebelumnya.hasTag("custom:log")) {
                     // Regenerasi pohon lama ke vanilla
                     konversiKeVanila(dimension, blokSebelumnya.location, blokSebelumnya.typeId);
                     
                     // Hapus semua countdown terkait pohon lama
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}:konversi`);
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}`);
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}:mundur`);
                     
                     player.onScreenDisplay.setActionBar("§c⚠ Pohon sebelumnya kembali ke awal!");
                     player.playSound("random.break");
                  }
               }
            }
            
            // Update tracker: pohon mana yang sedang dikerjakan pemain ini
            petaPohonAktifPerPemain.set(player.name, kunciPohonBaru);

            // Efek konversi
            player.playSound("dig.wood", { location: block.location, pitch: 1.3 });
            dimension.runCommand(`setblock ${x} ${y} ${z} ${idRTC}`);
            
            // ┌─────────────────────────────────────────────────────┐
            // │ COUNTDOWN FASE 1: KONVERSI (10 detik)               │
            // │ Vanilla → Custom dengan progress bar konversi       │
            // └─────────────────────────────────────────────────────┘
            const kunciKonversi = `${x}:${y}:${z}:${player.name}:konversi`;
            
            // TRACK pemain ini dalam countdown (untuk monitoring unsneak)
            petaPemainDalamCountdown.set(player.name, {
               namaPlayer: player.name,
               x, y, z,
               tipeBlok: idRTC,
               modeTampilan: 'konversi',
               waktuMultai: Date.now()
            });
            
            buatPerhitunganMundur(10, {
               blok: dimension.getBlock({ x, y, z }),
               dimensi: dimension,
               pemain: player,
               kunciPerhitungan: kunciKonversi,
               stateSekarang: 0,
               modeTampilan: 'konversi',
               mulaiBahasaanBaruMundur: false
            });
            
            player.onScreenDisplay.setActionBar("§a█§7░░░░ §eKONVERSI§r §e⏱ 10s§r");
            
         } catch (err) {
            console.warn(`❌ Error konversi vanilla: ${err}`);
            dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
         }
      });

      kurangiDurabilitas(dataEvent);
      dataEvent.cancel = true;
   }

   // ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   // ┃ BAGIAN 2: CUSTOM LOG PROGRESSION (FASE 2-4)              ┃
   // ┃ Trigger: rtc:custom:log + player sneaking + state < 4    ┃
   // ┃ Hasil: Progres ke state berikutnya + countdown progres   ┃
   // ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

   if (block.hasTag("custom:log")) {
      const stateSekarang = block.permutation.getState("log:state");
      const kunciMundur = `${block.location.x}:${block.location.y}:${block.location.z}:${player.name}`;
      const kunciKonversi = `${block.location.x}:${block.location.y}:${block.location.z}:${player.name}:konversi`;
      const kunciMundurCascade = `${block.location.x}:${block.location.y}:${block.location.z}:${player.name}:mundur`;
      const kunciPohonBaru = `${block.location.x}:${block.location.y}:${block.location.z}`;

      // ┌─────────────────────────────────────────────────────┐
      // │ PENGECEKAN: PLAYER TIDAK SNEAKING (state < 4)       │
      // │ Jika unsneak di phase 1-3 → Vanilla break only      │
      // │ (tidak progress, timer tetap jalan)                 │
      // └─────────────────────────────────────────────────────┘
      if (!validatePlayerSneak(player) && stateSekarang < 4) {
         // Player UNSNEAK saat custom log phase 1-3
         // → Allow vanilla break (drop 1 log, tidak progress)
         // → Countdown tetap jalan (bukan di-stop)
         dataEvent.cancel = false;  // Allow vanilla break
         return;  // Exit, tidak lanjut progres
      }

      // ✅ SNEAK VALIDATED: Progres ke fase berikutnya (state 1→2→3→4)
      if (validatePlayerSneak(player) && stateSekarang < 4) {
         system.run(() => {
            // Proteksi target switch (sama seperti vanilla handler)
            if (petaPohonAktifPerPemain.has(player.name)) {
               const kunciPohonSebelumnya = petaPohonAktifPerPemain.get(player.name);
               
               if (kunciPohonSebelumnya !== kunciPohonBaru) {
                  const [pxSebelum, pySebelum, pzSebelum] = kunciPohonSebelumnya.split(":").map(Number);
                  const blokSebelumnya = dimension.getBlock({ x: pxSebelum, y: pySebelum, z: pzSebelum });
                  
                  if (blokSebelumnya && blokSebelumnya.hasTag("custom:log")) {
                     konversiKeVanila(dimension, blokSebelumnya.location, blokSebelumnya.typeId);
                     
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}:konversi`);
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}`);
                     hentikanPerhitungan(`${pxSebelum}:${pySebelum}:${pzSebelum}:${player.name}:mundur`);
                     
                     player.onScreenDisplay.setActionBar("§c⚠ Pohon sebelumnya kembali ke awal!");
                     player.playSound("random.break");
                  }
               }
            }
            
            petaPohonAktifPerPemain.set(player.name, kunciPohonBaru);
            
            const stateBaruTarget = stateSekarang + 1;
            
            // Efek: suara dengan pitch meningkat sesuai progres fase
            player.playSound("dig.wood", {
               location: block.location,
               pitch: 1 + stateSekarang * 0.2,
            });

            // Naik ke state berikutnya (update texture otomatis)
            dimension.setBlockPermutation(block.location, block.permutation.withState("log:state", stateBaruTarget));
            
            // ┌─────────────────────────────────────────────────────┐
            // │ COUNTDOWN FASE 2-4: PROGRES (10 detik)              │
            // │ Timeout → Mundur 1 state + cascade mundur 5s        │
            // └─────────────────────────────────────────────────────┘
            hentikanPerhitungan(kunciMundur);
            hentikanPerhitungan(kunciKonversi);
            hentikanPerhitungan(kunciMundurCascade);
            
            // TRACK pemain ini dalam countdown (untuk monitoring unsneak)
            petaPemainDalamCountdown.set(player.name, {
               namaPlayer: player.name,
               x: block.location.x,
               y: block.location.y,
               z: block.location.z,
               tipeBlok: block.typeId,
               modeTampilan: 'progres',
               waktuMultai: Date.now()
            });
            
            // Buat countdown progres dengan auto cascade mundur
            buatPerhitunganMundur(10, {
               blok: block,
               dimensi: dimension,
               pemain: player,
               kunciPerhitungan: kunciMundur,
               stateSekarang: stateBaruTarget,
               modeTampilan: 'progres',
               mulaiBahasaanBaruMundur: true
            });
            
            // Tampilkan UI progress
            const palangProgres = "§a" + "█".repeat(stateBaruTarget) + "§7" + "░".repeat(4 - stateBaruTarget);
            const teksHitung = "§e⏱ 10s§r";
            player.onScreenDisplay.setActionBar(`${palangProgres} ${teksHitung}`);
            
            // Efek partikel: 5 butir crop dust saat setiap hit
            for (let i = 0; i < 5; i++) {
               dimension.spawnParticle("minecraft:crop_dust_particle", {
                  x: block.location.x + Math.random() - 0.5,
                  y: block.location.y + 0.5 + Math.random() * 0.5,
                  z: block.location.z + Math.random() - 0.5
               });
            }
         });

         kurangiDurabilitas(dataEvent);
         dataEvent.cancel = true;
      }
      
      // ┌─────────────────────────────────────────────────────┐
      // │ FINAL PHASE: STATE 4 → DESTROY TREE (hanya jika sneak)
      // │ Jika state === 4 dan player sneak → destroy.js exec
      // │ Jika state === 4 dan player unsneak → vanilla break  │
      // │ PENTING: Sneak check SEBELUM destroy execution!      │
      // └─────────────────────────────────────────────────────┘
      if (stateSekarang === 4) {
         // CRITICAL: Pastikan player sneak sebelum destroy
         if (!validatePlayerSneak(player)) {
            // Unsneak di state 4 → vanilla break only (1 log drop)
            // Tidak execute destroy code
            hentikanPerhitungan(kunciMundur);
            hentikanPerhitungan(kunciKonversi);
            hentikanPerhitungan(kunciMundurCascade);
            petaPemainDalamCountdown.delete(player.name);
            
            dataEvent.cancel = false;  // Allow vanilla break (1 log drop)
            return;
         }
         
         // ✅ SNEAK CONFIRMED: Cleanup tracking dan izinkan destroy.js
         hentikanPerhitungan(kunciMundur);
         hentikanPerhitungan(kunciKonversi);
         hentikanPerhitungan(kunciMundurCascade);
         petaPemainDalamCountdown.delete(player.name);
         
         // NOTE: destroy.js akan execute setelah event ini
         // destroy.js HARUS melakukan sneak check LAGI sebelum recursive destruction
      }
   }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ SISTEM DURABILITAS TOOL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📉 Hitung apakah damage harus apply
 * Dukungan enchantment Unbreaking: Makin tinggi level, makin kecil chance damage
 * 
 * @param {ItemStack} itemStack - Item di tangan pemain
 * @returns {boolean} true = apply damage, false = skip damage
 */
const hitungApakahDamage = (itemStack) => {
   const levelUnbreaking = itemStack.getComponent("enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
   return 1 / (levelUnbreaking + 1) >= Math.random();
};

/**
 * 🔨 Kurangi durability tool saat pemain break block
 * Dipanggil dari: event beforeEvents.playerBreakBlock
 * 
 * @param {*} dataEvent - Event object dari beforeEvents.playerBreakBlock
 */
function kurangiDurabilitas(dataEvent) {
   const { player, itemStack } = dataEvent;

   // Skip: Creative mode atau item tidak ada
   if (!player?.isValid || !itemStack || player.getGameMode() === "creative") return;

   // Skip: Probability based on Unbreaking enchantment
   if (!hitungApakahDamage(itemStack)) return;

   // Ambil component durability
   const componentDurabilitas = itemStack.getComponent("durability");
   if (!componentDurabilitas?.isValid) return;
   
   const sudahHabis = componentDurabilitas.damage >= componentDurabilitas.maxDurability;

   const kontainerTangan = player.getComponent("inventory").container;
   const slotSaatIni = player.selectedSlotIndex;

   system.run(() => {
      if (sudahHabis) {
         // Item break: hapus dari inventory
         kontainerTangan.setItem(slotSaatIni, undefined);
         player.playSound("random.break");
      } else {
         // Naik damage 1
         componentDurabilitas.damage++;
         kontainerTangan.setItem(slotSaatIni, itemStack);
      }
   });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 HANDLER ITEM: KONVERSI RTÉ → MINECRAFT OTOMATIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔄 Daftarkan: Setiap kali entity spawned (item drop)
 * Fungsi: Detect rtc: item + convert ke minecraft: + hapus rtc entity
 * 
 * Mencegah pemain collect item dengan namespace rtc: (custom)
 * Item otomatis converted ke vanilla minecraft: equivalent
 */
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
   if (!entity.getComponent("item")) return;
   
   const itemStack = entity.getComponent("item").itemStack;
   const { typeId } = itemStack;

   // Handle: rtc: items (custom logs dan items lainnya)
   if (!typeId.startsWith("rtc")) return;
   
   // Konversi: rtc: → minecraft:
   const idVanila = typeId.replaceAll(/rtc/g, "minecraft");
   entity.dimension.spawnItem(new ItemStack(idVanila), entity.location);
   
   // Hapus entity rtc: item (prevent duplication)
   entity.remove();
});

// ═══════════════════════════════════════════════════════════════════════════
// 🚫 HANDLER PLACEMENT: CEGAH PEMAIN PLACE RTÉ BLOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔴 Daftarkan: Setelah pemain place blok
 * Fungsi: Detect rtc: blok placement + remove immediately
 * 
 * Pemain tidak boleh place custom rtc: blok secara manual
 * Hanya event yang bisa create/konversi blok ke rtc:
 */
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
   if (!block.typeId.startsWith("rtc")) return;
   
   const { x, y, z } = block.location;
   block.dimension.runCommand(`setblock ${x} ${y} ${z} air`);
   player.runCommand("replaceitem entity @s slot.weapon.mainhand 0 air");
});

// ═══════════════════════════════════════════════════════════════════════════
// 🧹 CLEANUP: SAAT WORLD LOAD/UNLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔄 Daftarkan: Sebelum world initialize
 * Fungsi: Cleanup semua timer saat world load/unload/game exit
 * 
 * Mencegah: Memory leak dari timer yang tidak terbersihkan
 */
world.beforeEvents.worldInitialize.subscribe(() => {
   // Reset semua countdown timer
   petaPerhitunganMundur.forEach((perhitungan) => {
      if (perhitungan.idTimer !== null) {
         system.clearRun(perhitungan.idTimer);
      }
   });
   petaPerhitunganMundur.clear();
   
   // Clear pemain tracking
   petaPohonAktifPerPemain.clear();
   petaPemainDalamCountdown.clear();
   
   console.log("✅ Tree Capitator: Cleanup sempurna saat world initialize");
});

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ UNSNEAK HANDLING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🟢 INTEGRATED: Unsneak handling sekarang integrated di countdown loop
 * 
 * Fitur:
 *   ✅ Timer tetap jalan saat unsneak (tidak stop)
 *   ✅ Progres tidak di-reset (state tetap)
 *   ✅ Notifikasi pemain untuk sneak kembali
 *   ✅ Sebelum destroy: sneak check LAGI di replace.js beforeEvent
 *   ✅ Di destroy.js: sneak check SEBELUM recursive destruction
 * 
 * Flow:
 *   1. Player unsneak → Timer tetap jalan, notifikasi
 *   2. If timeout → Cascade mundur otomatis
 *   3. If sneak kembali → Continue normal progres
 *   4. If break state === 4 unsneak → Vanilla break (1 log only)
 *   5. If break state === 4 sneak → Destroy dengan sneak recheck
 */
