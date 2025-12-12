# 🌳 Lumber Pack BY LohaHola- Advanced Tree Chopping Addon for Minecraft PE

**Versi:** 1.1.0  
**Kompatibilitas:** Minecraft PE 1.20.80+  
**Tipe:** Behavior Pack Dengan Resource Pack

---

## 📋 Overview

Lumber Pack adalah addon canggih yang mengubah cara cara menebang pohon di Minecraft PE dengan sistem countdown bertingkat & keselamatan otomatis. Dapatkan kontrol penuh atas proses penebangan dengan visual feedback yang jelas dan perlindungan dari penghancuran pohon yang tidak disengaja.

**Fitur Utama:**
- ✅ Sistem 4-fase konversi blok dengan countdown 10 detik
- ✅ Penghancuran pohon otomatis dengan radius dinamis
- ✅ Cascade reversion mundur dengan proteksi pemain berpindah pohon
- ✅ Support multi-pemain dengan tracking pohon per-pemain
- ✅ Reduksi durabilitas alat dengan enchantment Unbreaking
- ✅ Particle effects & sound feedback real-time
- ✅ 11 varian pohon (Oak, Spruce, Birch, Jungle, Acacia, Dark Oak, Mangrove, Cherry, Crimson, Warped, Pale)

---

## 🎮 Cara Bermain

### **Fase 1: Konversi Blok (Vanilla → Custom)**

1. **Sneak + Hit vanilla log** (minecraft:oak_log, dll)
2. Blok berubah menjadi **custom texture** (rtc:oak_log)
3. Countdown **10 detik**
4. **Timeout?** → Pohon regenerate kembali ke vanilla

### **Fase 2-4: Progression dengan Countdown**

1. **Sneak + Hit custom log** sebelum timeout
2. Blok mengubah **state** (1→2→3→4)
3. Setiap progres countdown **RESET ke 10 detik**
4. Visual menunjukkan progress
5. **Timeout?** → Cascade mundur dimulai

### **Cascade Mundur (Automatic Reversion)**

Jika timeout, sistem **otomatis mundur ke fase sebelumnya** dengan countdown 5 detik:

```
Fase 4 [10s timeout]
   ↓ 🟨MUNDUR🟨 (5s)
Fase 3 [5s timeout]
   ↓ 🟨MUNDUR🟨 (5s)
Fase 2 [5s timeout]
   ↓ 🟨MUNDUR🟨 (5s)
Fase 1 [5s timeout]
   ↓ ❌ Back to Vanilla
```

### **Fase 4: Penghancuran Pohon**

1. Setelah mencapai **fase 4**, normal-break block (tidak perlu sneak)
2. **Seluruh pohon otomatis hancur:**
   - Semua log dihancurkan recursively
   - Leaves dalam radius dinamis juga hancur
   - Batching mencegah lag (max 8 blok/cycle)
3. Blok yang jatuh:
   - Log vanilla (minecraft:oak_log, dll)
   - Sticks dan lainnya dari leaves (natural drop)

---

## 🛡️ Perlindungan & Keamanan

### **Target Switch Protection**
Jika pemain berpindah ke pohon lain saat countdown aktif:
- Pohon sebelumnya **otomatis regenerate ke vanilla**
- Semua countdown dibersihkan
- Pemain dapat mulai pohon baru tanpa penalty

### **Sneak-Only Mining**
- Hanya mining dengan **sneak** yang memicu sistem countdown
- Normal mining tidak mengaktifkan mekanik ini
- Mencegah destruction yang tidak disengaja
- Player masih bisa melanjutkan progres jika tidak sengaja **unsneak**

### **Guard Clauses**
- Mencegah "ghost timer" yang terus jalan
- Timer otomatis clear saat timeout terdeteksi
- Memory leak prevention dengan cleanup di world load

---

## 🔧 Technical Architecture

### **File Structure**
```
lumber pack by Arya/
├── manifest.json          # Addon metadata
├── blocks/                # Custom block definitions
│   ├── oak.json
│   ├── spruce.json
│   ├── birch.json
│   └── ... (11 total)
├── scripts/
│   ├── main.js                    # Entry point
│   ├── export.js                  # API imports
│   ├── tree_capitator/
│   │   ├── replace.js             # Event handlers & countdown logic
│   │   ├── destroy.js             # Recursive tree destruction
│   │   ├── world_properties.js    # Dynamic marker tracking
│   │   └── ticking.js             # Placeholder for tick logic
```

### **Data Structures**

**petaPerhitunganMundur** (Countdown Map)
```javascript
Map<string, CountdownData>
├─ Key: "x:y:z:namaPlayer" | "x:y:z:namaPlayer:konversi"
├─ Value: {
     waktuTersisa: number,
     idTimer: number,
     stateBlok: number,
     modeTampilan: 'konversi' | 'progres' | 'mundur'
   }
```

**petaPohonAktifPerPemain** (Active Tree Tracker)
```javascript
Map<string, string>
├─ Key: "namaPlayer"
├─ Value: "x:y:z" (pohon coordinates)
└─ Update otomatis saat switch pohon
```

### **Event Flow**

```
1. beforeEvents.playerBreakBlock (replace.js)
   ├─ Check sneak status
   ├─ Validate log type (vanilla/custom)
   ├─ Handle target switch
   └─ Start/progress countdown
   
2. afterEvents.playerBreakBlock (destroy.js)
   ├─ Check if state === 4
   └─ Recursive tree destruction
   
3. afterEvents.entitySpawn (replace.js)
   ├─ Detect rtc: items
   └─ Convert to vanilla + remove rtc entity
   
4. beforeEvents.worldInitialize (replace.js)
   └─ Cleanup all timers on world load
```

### **Countdown Phases**

| Fase | Durasi | Mode | Action |
|------|--------|------|--------|
| Konversi | 10s | Vanilla → Custom | Block texture change |
| 1→2 | 10s | Progres | State increment |
| 2→3 | 10s | Progres | State increment |
| 3→4 | 10s | Progres | State increment |
| Mundur | 5s | Cascade | State decrement |

---

## 🚀 Installation

### **Cara Install:**
1. Download file `.mcpack` script dan models nya
2. Buka di Minecraft PE
3. Pilih "Add" atau "Activate"
4. Aktifkan di world settings:
   - ✅ Behavior Packs: Lumber Pack V1.0.0
   - ✅ Resource Packs: Wood Pack V1.0.0
5. Mulai bermain!

### **Testing Checklist:**
- ✅ Sneak + hit vanilla log → texture change + countdown
- ✅ Hit sebelum timeout → progress fase
- ✅ Tunggu timeout → cascade mundur
- ✅ Reach fase 4 → normal break → tree destruction
- ✅ Switch pohon → old tree regenerate

---

## 📊 Statistics

**Kodebase:**
- Total Lines: 850+ (6 files)
- Functions: 15+
- Data Maps: 2 (countdown + player tracking)
- Event Handlers: 9
- Compile Errors: 0 ✅

**Performance:**
- Max Timers per World: Unlimited (cleanup on load)
- Batching: 3 blocks/cycle
- Tree Size Support: Up to 100+ blocks
- Multi-player: ✅ Supported

---

## 💡 Tips & Tricks

### **Optimal Farming:**
1. Hold sneak button → spam click pohon
2. Countdown otomatis reset setiap hit
3. Tidak ada pressure waktu, work at your pace
4. Tool durability tergantung Unbreaking level

### **Safety:**
- Jangan lupa sneak saat mining
- Jika lag, let countdown finish
- Use Unbreaking III pickaxe untuk durability max

### **Custom Blocks:**
- rtc: blocks tidak bisa ditemukan naturally
- Gunakan creative mode untuk obtain
- Blok langsung convert ke vanilla saat drop

---

## 📝 Changelog

### **Version 1.1.0** (December 12, 2025)
- ✅ Change the batching cycle maximum destroy to 8 from 3
- ✅ Multi-player support
- ✅ Durability + Unbreaking
- ✅ Recursive tree destruction
- ✅ Zero compile errors
- ✅ Full Indonesian documentation

---

**Enjoy tree chopping dengan cara yang lebih aman & kontrol penuh!** 🌳✨

---

## 🎨 Visual Feedback

### **Action Bar Display**

```
Konversi:  🟥🟥🟥🟥 KONVERSI ⏱ 10s
Progres:   🟩🟩🟩🟩 ⏱ 10s

```

### **Sound Effects**
- **dig.wood** → Saat hit log (pitch varies per phase)
- **random.break** → Timeout/revert

### **Particle Effects**
- **crop_dust_particle** → 5 partikel per hit
- Lokasi random di sekitar block

---

## 🔧 Durability & Enchantments

### **Tool Durability**
- Setiap hit berkurang **1 durability**
- Support **Unbreaking enchantment**:
  - Level 1: 50% chance damage
  - Level 2: 33% chance damage
  - Level 3: 25% chance damage

---

## ⚙️ Requirements

- **Minecraft PE:** 1.20.80 atau lebih baru
- **Game Mode:** Survival

---

## 🐛 Known Issues & Limitations

- Custom blocks hanya bisa diperoleh melalui creative mode
- Tidak support command placement (rtc: blocks)
- Addon ini satu-satunya untuk tree chopping
1. **No Memory Leak**: Timer di-clear setiap countdown baru
2. **Player Validation**: Cek `player.isValid` di durability system
3. **World Cleanup**: `beforeEvents.worldInitialize` clears semua timers on reload
4. **Error Handling**: Try-catch di regenerateTree function

---

## 🎮 Gameplay Examples

### Scenario 1: Normal Tree Chop (Success)
```
Hit 1: State 1→2, Countdown: 10s ⏱
Hit 2: State 2→3, Countdown: RESET 10s ⏱
Hit 3: State 3→4, Countdown: RESET 10s ⏱
Hit 4: Destroy! Tree falls completely ✓
```

### Scenario 2: AFK/Delay (Regenerate)
```
Hit 1: State 1→2, Countdown: 10s ⏱
Wait...
Countdown: 9s, 8s, 7s, 6s, 5s, 4s (§c red), 3s, 2s, 1s (§c red)
Timeout! ❌ Pohon regenerate ke state 1
```

### Scenario 3: Multiple Blocks
```
Player A attacks Tree A:
   Block A at 100,64,100 starts countdown
   
Player B attacks Tree B:
   Block B at 200,64,200 starts countdown (independent)
   
Both countdowns run simultaneously ✓
```

---

## 🐛 Debugging Tips

1. **Countdown not showing**: Check if player.onScreenDisplay is valid
2. **Regenerate not working**: Ensure block typeId includes `rtc:` prefix
3. **Timer not clearing**: Check system.clearRun() is called
4. **Memory issues**: Monitor countdownMap size in console

---

## 📝 Future Enhancements FOR THIS VERSION

- [ ] Perbaiki fitur cancel penebangan agar lebih nyaman
- [ ] Sound effect setiap detik countdown (tick-tock)
- [ ] Custom regenerate animation (particles) "kalau saya tidak malas :V"
- [ ] Configurable countdown duration per wood type "versi kecil selanjutnya"
- [ ] GUI untuk pengaturan yang lebih fleksibel