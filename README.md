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
- หน้าแผนที่แสดงสถานีตรวจวัดคลองรอบสมุทรปราการและพื้นที่ต้นทางที่เชื่อมต่อการระบายน้ำ โดยดึงสถานะ พิกัด ระดับ และเกณฑ์สถานีจาก [ระบบตรวจวัดระดับน้ำ สำนักการระบายน้ำ กทม.](https://weather.bangkok.go.th/water/) และแคช 5 นาที ค่าระดับเป็นเมตรเทียบระดับทะเลปานกลาง (ม.รทก.) ไม่ใช่ความลึกคลอง; สีใช้สถานะทางการของสถานี (ปกติ/เตือนภัย/วิกฤต/ขัดข้อง) ประวัติที่หน้าเว็บต้นทางเผยแพร่ครอบคลุมประมาณ 48 ชั่วโมง จึงไม่มีค่าที่ 3 วันก่อนเมื่อไม่มีข้อมูล
- ข้อมูลจากสำนักการระบายน้ำ กทม. มีเงื่อนไขการนำไปใช้แบบไม่ใช่เชิงพาณิชย์ตาม [Data Catalog](https://dxs.dds.bangkok.go.th/public/services/22) และให้เปิดลิงก์กลับไปยังสถานีต้นทางจากรายละเอียดจุดบนแผนที่
- ขอบเขตจังหวัดมาจาก [cvibhagool/thailand-map](https://github.com/cvibhagool/thailand-map) และย่อจุดพิกัดเพื่อให้เหมาะกับการแสดงผลบนเว็บ
- หน้า CCTV แสดงเฉพาะสตรีม HLS สาธารณะที่ตรวจพบในรายการกล้อง Longdo Traffic 2 ทิศทางจากกรมทางหลวง บริเวณทางหลวงหมายเลข 3 กม.6; ไม่พบฟีดสาธารณะที่ยืนยันได้สำหรับสถานที่ตัวอย่างอื่นจึงนำออกจากรายการแล้ว กล้อง RTSP ต้องมีบริการแปลง/relay เป็น HLS หรือ browser-compatible feed ก่อนนำมาเพิ่ม
- หากเปิดรับรายงานสาธารณะในวงกว้าง ควรเพิ่มการป้องกันสแปมและขั้นตอนตรวจสอบรายงานก่อนประชาสัมพันธ์ URL ให้ประชาชนใช้งาน
