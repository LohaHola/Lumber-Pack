/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🏷️ SISTEM MARKER DINAMIS - TRACKING BLOK VANILLA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Fungsi: 
 *   1. Mark blok vanilla saat player place → cegah double-process
 *   2. Unmark saat pemain break blok → siap proses ulang
 * 
 * Marker Key: "tc:x:y:z" → Untuk tracking blok yang sudah diproses
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { world } from "./export";

// ═══════════════════════════════════════════════════════════════════════════
// 🗑️ BERSIHKAN MARKER SAAT BLOK DI-BREAK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔴 Daftarkan: Setelah pemain break blok (afterEvent)
 * Fungsi: Hapus marker dinamis saat blok dipecah
 * 
 * Marker digunakan untuk cegah double-processing sebelum event selesai
 */
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
   const { x, y, z } = block.location;
   const kunciMarker = `tc:${x}:${y}:${z}`;
   
   // Hapus marker jika ada
   if (world.getDynamicProperty(kunciMarker) !== undefined) {
      world.setDynamicProperty(kunciMarker, undefined);
   }
});

// ═══════════════════════════════════════════════════════════════════════════
// 🏷️ TANDAI BLOK VANILLA SAAT PLAYER PLACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🟢 Daftarkan: Setelah pemain place blok (afterEvent)
 * Fungsi: Mark vanilla log saat player placement
 * 
 * Marker mencegah event handler yang sama memproses blok 2x dalam 1 tick
 * Marker akan dihapus saat blok di-break
 */
world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
   const idTipeBlok = block.typeId;
   const { x, y, z } = block.location;

   // Mark hanya blok vanilla minecraft:log atau minecraft:stem
   if (idTipeBlok.startsWith("minecraft") && (idTipeBlok.endsWith("_stem") || idTipeBlok.endsWith("_log"))) {
      const kunciMarker = `tc:${x}:${y}:${z}`;
      world.setDynamicProperty(kunciMarker, true);
   }
});

