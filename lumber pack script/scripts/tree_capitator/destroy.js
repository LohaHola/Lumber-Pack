/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🌳 SISTEM PENGHANCURAN POHON RECURSIVE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Fungsi: Hancurkan seluruh pohon secara recursive saat state 4 terpenuhi
 * 
 * Algoritma:
 *   1. Deteksi custom:log tag + state 4
 *   2. Gunakan generator untuk mengolah banyak blok tanpa freeze
 *   3. Ekspansi dinamis: cari log tetangga, destroy leaves dengan delay
 *   4. Batching: max 8 blok per cycle, queue ulang jika lebih
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { world, system, ItemStack } from "./export";

// ─────────────────────────────────────────────────────────────────────────
// 📍 KONSTANTA ARAH PENCARIAN (26 arah dari pusat blok)
// ─────────────────────────────────────────────────────────────────────────
const ARAH_PENCARIAN = [
   // Horizontal: kanan, kiri, depan, belakang
   { dx: 1, dy: 0, dz: 0 },
   { dx: -1, dy: 0, dz: 0 },
   { dx: 0, dy: 1, dz: 0 },
   { dx: 0, dy: -1, dz: 0 },
   // Vertikal: atas 1, atas 2
   { dx: 0, dy: 0, dz: 1 },
   { dx: 0, dy: 0, dz: -1 },
   { dx: 0, dy: 2, dz: 0 },
   // Diagonal 1 tingkat atas
   { dx: 1, dy: 1, dz: 0 },
   { dx: -1, dy: 1, dz: 0 },
   { dx: 0, dy: 1, dz: 1 },
   { dx: 0, dy: 1, dz: -1 },
   // Diagonal horizontal
   { dx: 1, dy: 0, dz: 1 },
   { dx: -1, dy: 0, dz: -1 },
   { dx: 1, dy: 0, dz: -1 },
   { dx: -1, dy: 0, dz: 1 },
   // Diagonal 2 tingkat atas
   { dx: 1, dy: 1, dz: 1 },
   { dx: 1, dy: 1, dz: -1 },
   { dx: -1, dy: 1, dz: -1 },
   { dx: -1, dy: 1, dz: 1 },
];

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 EVENT HANDLER - SETELAH PEMAIN BREAK CUSTOM LOG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔴 Daftarkan: Setelah pemain break blok (afterEvent)
 * Trigger: Block dengan tag custom:log sudah dipecah (state 4)
 * Hasil: Recursive tree destruction dengan leaves cleanup
 * 
 * SNEAK VALIDATION:
 *   ✅ CRITICAL: Check sneak status SEBELUM recursive destruction
 *   ✅ Jika player tidak sneak → allow vanilla break (1 log drop only)
 *   ✅ Jika player sneak → execute recursive tree destruction
 */
world.afterEvents.playerBreakBlock.subscribe(({ brokenBlockPermutation, block, player, dimension }) => {
   // Skip: bukan custom log
   if (!brokenBlockPermutation.hasTag("custom:log")) return;
   
   // ✅ SNEAK CHECK SEBELUM DESTROY EXECUTION
   // Jika player tidak sneak → tidak destroy (already handled di beforeEvent)
   // Jika player sneak → lanjut ke recursive destruction
   if (!player?.isValid || !player.isSneaking) {
      // Unsneak detected → vanilla break already handled, don't destroy
      return;
   }
   
   system.run(() => {
      const { x, y, z } = block.location;
      const idTipeAsli = brokenBlockPermutation.type.id;
      const himpunanVisited = new Set();

      // Efek suara penghancuran
      player.playSound("dig.wood", { location: block.location, pitch: 1.3 });

      /**
       * 🔄 Generator: Proses penghancuran blok log tetangga secara recursive
       * 
       * @param {number} cx - Koordinat X pusat pencarian
       * @param {number} cy - Koordinat Y pusat pencarian
       * @param {number} cz - Koordinat Z pusat pencarian
       * @param {number} count - Counter berapa banyak blok sudah diproses (batching)
       * @yields Yield untuk delay processing (prevent freeze)
       * @returns Generator untuk tree destruction
       */
      function* prosesLogTetangga(cx, cy, cz, count) {
         for (const { dx, dy, dz } of ARAH_PENCARIAN) {
            const nx = cx + dx;
            const ny = cy + dy;
            const nz = cz + dz;
            const kunciBlok = `${nx},${ny},${nz}`;
            
            // Skip: Sudah di-visit sebelumnya
            if (himpunanVisited.has(kunciBlok)) continue;
            himpunanVisited.add(kunciBlok);

            const tetanggaBlok = dimension.getBlock({ x: nx, y: ny, z: nz });
            if (!tetanggaBlok) continue;

            // Check: Apakah log/stem?
            const tipeTetangga = tetanggaBlok.typeId;
            if (!(tipeTetangga.includes("log") || tipeTetangga.includes("stem")) && 
                !(tipeTetangga.includes("stripped") && tipeTetangga.includes("log"))) {
               continue;
            }

            yield;
            hancurkanBlok(dimension, nx, ny, nz);

            // Hitung jari-jari dinamis untuk destroy leaves
            const { jariX, jariZ } = yield* hitungJariDinamis(dimension, nx, ny, nz);

            // Destroy leaves hanya jika bukan stem
            if (!idTipeAsli.includes("stem")) {
               for (let ox = -jariX; ox <= jariX; ox++) {
                  for (let oz = -jariZ; oz <= jariZ; oz++) {
                     for (let oy = -2; oy <= 2; oy++) {
                        const lx = nx + ox;
                        const ly = ny + oy;
                        const lz = nz + oz;

                        system.runTimeout(() => {
                           const daunBlok = dimension.getBlock({ x: lx, y: ly, z: lz });
                           if (daunBlok?.typeId.includes("leaves")) {
                              hancurkanBlok(dimension, lx, ly, lz);
                           }
                        }, Math.abs(ox) + Math.abs(oz) + 20);
                     }
                  }
                  yield;
               }
            }

            // Batching: Max 8 blok per cycle, jika lebih queue ulang
            if (++count >= 8) {
               system.runTimeout(() => system.runJob(prosesLogTetangga(nx, ny, nz, 0)), 20);
               return;
            } else {
               // Recursive: lanjut ke tetangga blok berikutnya
               yield* prosesLogTetangga(nx, ny, nz, count);
            }
         }
      }

      // Jalankan generator dengan runJob
      system.runJob(prosesLogTetangga(x, y, z, 0));
   });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 💥 Hancurkan blok dengan command setblock air
 * 
 * @param {Dimension} dimensi - Dimensi tempat blok berada
 * @param {number} x - Koordinat X
 * @param {number} y - Koordinat Y
 * @param {number} z - Koordinat Z
 */
function hancurkanBlok(dimensi, x, y, z) {
   dimensi.runCommand(`setblock ${x} ${y} ${z} air destroy`);
}

/**
 * 📏 Hitung jari-jari dinamis untuk destroy leaves
 * Semakin dekat dengan pusat log (0,0), semakin besar jari-jarinya
 * 
 * Algoritma:
 *   1. Scan 3×3×3 area di sekitar pusat
 *   2. Cari log blocks
 *   3. Kalkulasi radius inverse: makin banyak log = radius lebih kecil
 * 
 * @param {Dimension} dimensi - Dimensi tempat blok berada
 * @param {number} x - Koordinat X pusat
 * @param {number} y - Koordinat Y pusat
 * @param {number} z - Koordinat Z pusat
 * @yields Yield untuk delay processing
 * @returns Object {jariX, jariZ} radius dinamis
 */
function* hitungJariDinamis(dimensi, x, y, z) {
   let rx = 2, rz = 2;

   for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
         if (dx === 0 && dz === 0) continue;
         
         const jarakX = Math.abs(dx);
         const jarakZ = Math.abs(dz);

         for (let dy = -3; dy <= 3; dy++) {
            const blokScan = dimensi.getBlock({ x: x + dx, y: y + dy, z: z + dz });
            if (blokScan?.typeId.includes("log")) {
               // Jika ada log dekat center, kurangi radius
               if (jarakX <= 2 || jarakZ <= 2) return { jariX: 0, jariZ: 0 };
               rx = Math.max(1, rx - 1);
               rz = Math.max(1, rz - 1);
            }
            yield;
         }
      }
      yield;
   }

   return { jariX: rx, jariZ: rz };
}
