# น้ำสมุทรปราการ — Flood Watch

เว็บรายงานและติดตามระดับน้ำในจังหวัดสมุทรปราการ สร้างด้วย Next.js, TypeScript, Leaflet/OpenStreetMap และ Supabase

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 18.18 ขึ้นไป

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000` เว็บไซต์จะแสดงข้อมูลตัวอย่างเมื่อยังไม่ได้ตั้งค่า Supabase การส่งรายงานในโหมดนี้บันทึกเฉพาะเบราว์เซอร์เครื่องนั้น ยังไม่ซิงก์ไปยังผู้ใช้อื่น

## เปิดใช้รายงานเรียลไทม์ด้วย Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com/) แล้วเปิด **SQL Editor**
2. วางและรันคำสั่งทั้งหมดใน `supabase/schema.sql` เพื่อสร้างตาราง `reports`, policy, bucket รูปภาพ และเปิด Realtime
3. ไปที่ **Project Settings → API** แล้วคัดลอก Project URL และ public `anon` key (หรือ publishable key ที่โปรเจกต์รองรับ)
4. สร้างไฟล์ `.env.local` ที่ root ของโปรเจกต์ โดยใส่ค่า:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
   ```

5. รีสตาร์ต `npm run dev` รายงานใหม่ สถานะ “ยังท่วมอยู่/น้ำลดแล้ว” และการแจ้งข้อมูลไม่ถูกต้องจะอ่าน/เขียนผ่าน Supabase และซิงก์ด้วย Realtime

> ใช้เฉพาะ public anon/publishable key ในเว็บไซต์ ห้ามนำ Supabase `service_role` key ไปใส่ในตัวแปร `NEXT_PUBLIC_*` หรือส่งขึ้นเบราว์เซอร์

## LINE OA แจ้งเตือนสภาพอากาศ

Webhook URL ที่ใส่ใน **LINE Developers Console → Messaging API → Webhook URL** คือ:

```text
https://<โดเมนที่ deploy แล้ว>/api/line/webhook
```

เช่น `https://your-project.vercel.app/api/line/webhook` ใช้โดเมน HTTPS จริงของเว็บไซต์ ไม่ใช้ `localhost`; หลังตั้งค่าให้เปิด **Use webhook** และกด **Verify**

ตั้งค่า server environment จาก `.env.example` ใน Vercel (ห้ามใส่ secret ใน `NEXT_PUBLIC_*`):

- `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` จาก Messaging API channel ที่เชื่อมกับ OA
- `SUPABASE_SERVICE_ROLE_KEY` จาก Supabase เพื่อให้ webhook เขียน subscription และบันทึกผลการส่งได้; รัน `supabase/schema.sql` อีกครั้งเพื่อสร้างตาราง LINE
- `CRON_SECRET` เป็นค่าสุ่มยาวสำหรับป้องกัน endpoint ตรวจอากาศ
- `TMD_API_UID` / `TMD_API_KEY` ใช้กับ WeatherWarningNews (ตัวอย่างทางการคือ `demo` / `demokey`; ใช้บัญชี production หากลงทะเบียนไว้)
- `TMD_NWP_ACCESS_TOKEN` คือ OAuth Access Token จาก [TMD Weather Forecast API](https://data.tmd.go.th/nwpapi/login) สำหรับพยากรณ์รายชั่วโมงตามอำเภอ/ตำบล เก็บไว้ใน server environment เท่านั้น

เมื่อผู้ใช้เพิ่มเพื่อน OA ระบบจะแสดงปุ่ม Quick Reply ตามลำดับ: `เริ่มสมัคร` → `ยินยอม` / `ไม่ยินยอม` → `แชร์ตำแหน่ง` โดยปุ่มแชร์ตำแหน่งจะเปิดตัวเลือกตำแหน่งของ LINE และยังคงพิมพ์ `สมัคร`, `ยินยอม`, `ตำแหน่ง` หรือ `หยุด` แทนการกดปุ่มได้ ระบบยอมรับเฉพาะตำแหน่งในสมุทรปราการและเก็บพิกัดที่ปัดเศษประมาณ 1 กม.; การแชร์ตำแหน่งเป็นการเลือกและส่งโดยผู้ใช้เอง ไม่ติดตามเบื้องหลัง

- `GET /api/cron/weather-alerts` ตรวจประกาศ TMD ที่ครอบคลุมสมุทรปราการ และหากตั้ง `TMD_NWP_ACCESS_TOKEN` จะใช้พยากรณ์รายชั่วโมงจากตำแหน่งย่อยด้วย: รหัสสภาพอากาศ 7/8 (ฝนหนัก/ฝนฟ้าคะนอง), 9/10 (หนาวจัด/หนาว), 12 (ร้อนจัด) โดยเตือนเมื่อคาดว่าจะเกิดใน 3 ชั่วโมงข้างหน้า และจำกัดการส่งซ้ำตามพื้นที่/ประเภท/วัน
- ตั้ง Supabase Cron ทุก 15 นาทีตาม `supabase/line-weather-cron.example.sql`; ต้องเปิด `pg_cron`/`pg_net` และเก็บ URL/`CRON_SECRET` ใน Vault ก่อนใช้

## Deploy บน Vercel

### วิธีผ่าน GitHub

1. สร้าง repository บน GitHub และ push ไฟล์โปรเจกต์ขึ้นไป
2. เข้า [vercel.com/new](https://vercel.com/new) แล้ว Import repository
3. Vercel ตรวจพบ Next.js ให้อัตโนมัติ ใช้ค่า Build Command `next build` และ Output defaults
4. ก่อน Deploy ให้เพิ่ม `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ที่ **Project → Settings → Environment Variables** สำหรับ Production (และ Preview ถ้าต้องการ)
5. กด Deploy เมื่อ deploy เสร็จ ผูกโดเมนได้จาก **Settings → Domains**

### วิธีผ่าน Vercel CLI

```bash
npm install
npm run build
npm install -g vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

เพิ่ม environment variables ใน Production และ Preview ตามต้องการ จากนั้น deploy ใหม่ทุกครั้งที่แก้ค่า environment variables

## ข้อมูลแผนที่ กล้อง และตัวอย่าง

- จุดรายงานเริ่มต้นเป็น **ข้อมูลตัวอย่าง** เพื่อแสดงหน้าตาและการทำงานของแผนที่ ควรลบหรือแทนที่ก่อนเปิดเผยต่อสาธารณะ
- ใน Supabase การรัน schema จะสร้างฐานข้อมูลว่าง ไม่ได้ใส่รายงานตัวอย่างจากหน้าเว็บลงฐานข้อมูล
- แผนที่ใช้ tile ของ OpenStreetMap และต้องเชื่อมต่ออินเทอร์เน็ต; จุดรายงานเป็นวงกลมสีและพื้นที่นอกจังหวัดถูกหรี่ลง
- หน้าแผนที่ระดับน้ำเปิดชั้นพยากรณ์ฝนรายชั่วโมงล่วงหน้าได้ถึง 24 ชั่วโมงจาก [Open-Meteo](https://open-meteo.com/) โดยระบบแคชข้อมูล 30 นาที; ข้อมูลฝนแสดงเป็นมิลลิเมตรต่อชั่วโมงและไม่ใช่การยืนยันระดับน้ำท่วม Open-Meteo ระบุการใช้งาน API ฟรีสำหรับงานที่ไม่ใช่เชิงพาณิชย์ และกำหนดให้แสดงที่มาตาม CC BY 4.0
- ชั้นสถานีวัดระดับน้ำใช้ข้อมูลสาธารณะจาก [ThaiWater](https://www.thaiwater.net/) สำหรับสถานีระดับน้ำลำน้ำและคลองในจังหวัดสมุทรปราการ; ค่าที่อัปเดตเกิน 24 ชั่วโมงจะแสดงเป็นข้อมูลเก่า และระดับน้ำอ้างอิงเป็นเมตรจากระดับทะเลปานกลาง (ม.รทก.)
- หน้าแผนที่แสดงสถานีตรวจวัดคลองรอบสมุทรปราการและพื้นที่ต้นทางที่เชื่อมต่อการระบายน้ำ โดยดึงสถานะ พิกัด ระดับ และเกณฑ์สถานีจาก [ระบบตรวจวัดระดับน้ำ สำนักการระบายน้ำ กทม.](https://weather.bangkok.go.th/water/) และแคช 5 นาที ค่าระดับเป็นเมตรเทียบระดับทะเลปานกลาง (ม.รทก.) ไม่ใช่ความลึกคลอง; สีใช้สถานะทางการของสถานี (ปกติ/เตือนภัย/วิกฤต/ขัดข้อง) ประวัติที่หน้าเว็บต้นทางเผยแพร่ครอบคลุมประมาณ 48 ชั่วโมง จึงไม่มีค่าที่ 3 วันก่อนเมื่อไม่มีข้อมูล
- ข้อมูลจากสำนักการระบายน้ำ กทม. มีเงื่อนไขการนำไปใช้แบบไม่ใช่เชิงพาณิชย์ตาม [Data Catalog](https://dxs.dds.bangkok.go.th/public/services/22) และให้เปิดลิงก์กลับไปยังสถานีต้นทางจากรายละเอียดจุดบนแผนที่
- ขอบเขตจังหวัดมาจาก [cvibhagool/thailand-map](https://github.com/cvibhagool/thailand-map) และย่อจุดพิกัดเพื่อให้เหมาะกับการแสดงผลบนเว็บ
- ขอบเขตอำเภอ 6 แห่งบนแผนที่มาจาก [geoBoundaries Thailand ADM2](https://www.geoboundaries.org/), source data 2019 จาก Royal Thai Survey Department / OCHA ROAP ภายใต้ CC BY 3.0 IGO และย่อพิกัดเพื่อการแสดงผล
- หน้า CCTV แสดงสตรีม HLS สาธารณะ iTIC Motion บนถนนบางนา–ตราด 2 จุด (BMAI0208 และ BMAI0209) ผ่าน Longdo Traffic; สตรีมกรมทางหลวงเดิมที่ กม.6 ตอบกลับ 502 จึงถูกนำออกจากรายการ กล้อง BMAI0202 ในรายการ iTIC ปัจจุบันระบุอยู่ที่ถนนพัทยา–นาเกลือ จังหวัดชลบุรี ไม่ใช่บางนา–ตราด และฟีดไม่พร้อมใช้งาน จึงไม่แสดงเป็นกล้องสมุทรปราการ กล้อง RTSP ต้องมีบริการแปลง/relay เป็น HLS หรือ browser-compatible feed ก่อนนำมาเพิ่ม
- หากเปิดรับรายงานสาธารณะในวงกว้าง ควรเพิ่มการป้องกันสแปมและขั้นตอนตรวจสอบรายงานก่อนประชาสัมพันธ์ URL ให้ประชาชนใช้งาน
