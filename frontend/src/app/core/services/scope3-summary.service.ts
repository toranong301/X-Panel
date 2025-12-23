import { Injectable } from '@angular/core';
import { Scope3ItemRow, Scope3SummaryStore } from '../../models/scope3-summary.model';

@Injectable({ providedIn: 'root' })
export class Scope3SummaryService {
  private key(cycleId: number) {
    return `ghg.scope3.summary.v1.cycle.${cycleId}`;
  }

  private num(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private str(v: any, fallback = '') {
    return v === null || v === undefined ? fallback : String(v);
  }

  /** แปลงข้อมูลเก่า/ข้อมูลที่ field ชื่อไม่ตรง ให้กลับมาเป็น shape ปัจจุบัน */
  private normalizeRow(raw: any): Scope3ItemRow {
    const categoryLabel = this.str(raw?.categoryLabel ?? raw?.catLabel ?? '');
    const itemLabel = this.str(raw?.itemLabel ?? raw?.itemName ?? raw?.category ?? '');

    const r: Scope3ItemRow = {
      type: 'item',
      tgoNo: this.str(raw?.tgoNo ?? ''),
      scopeIso: this.str(raw?.scopeIso ?? raw?.isoScope ?? ''),
      categoryLabel,
      order: this.num(raw?.order ?? 0),

      itemLabel,
      unit: this.str(raw?.unit ?? ''),
      quantityPerYear: this.num(raw?.quantityPerYear ?? raw?.quantity ?? 0),

      remark: raw?.remark ?? '',
      dataEvidence: raw?.dataEvidence ?? raw?.dataRef ?? '',
      ef: this.num(raw?.ef ?? raw?.emissionFactor ?? 0),
      efEvidence: raw?.efEvidence ?? raw?.efRef ?? '',

      // computed (อาจมีติดมาจากเก่า)
      totalTco2e: raw?.totalTco2e ?? raw?.ghgTco2e ?? undefined,
      sharePct: raw?.sharePct ?? raw?.pct ?? undefined,

      // refs (ถ้ามี)
      refs: raw?.refs ?? undefined,
    };

    // เติม compat fields ให้จบในตัว
    r.catLabel = r.categoryLabel;
    r.itemName = r.itemLabel;
    r.ghgTco2e = r.totalTco2e;
    r.pct = r.sharePct;

    return r;
  }

  load(cycleId: number): Scope3SummaryStore | null {
    try {
      const raw = localStorage.getItem(this.key(cycleId));
      if (!raw) return null;

      const doc = JSON.parse(raw) as Scope3SummaryStore;
      if (!doc?.rows || !Array.isArray(doc.rows)) return null;

      doc.rows = doc.rows.map(r => this.normalizeRow(r));
      return doc;
    } catch {
      return null;
    }
  }

  save(cycleId: number, rows: Scope3ItemRow[]) {
    const normalized = rows.map(r => this.normalizeRow(r));

    const payload: Scope3SummaryStore = {
      rows: normalized,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.key(cycleId), JSON.stringify(payload));
  }

  // ===== MOCK ตามตารางใหม่ =====
  getMockRows(_cycleId: number): Scope3ItemRow[] {
    const rows: Scope3ItemRow[] = [];

    const add = (
      g: { tgoNo: string; scopeIso: string; categoryLabel: string; order: number },
      i: {
        itemLabel: string;
        unit: string;
        quantityPerYear: number;
        remark?: string;
        dataEvidence?: string;
        ef: number;
        efEvidence?: string;
      }
    ) => {
      const r: Scope3ItemRow = {
        type: 'item',
        tgoNo: g.tgoNo,
        scopeIso: g.scopeIso,
        categoryLabel: g.categoryLabel,
        order: g.order,

        itemLabel: i.itemLabel,
        unit: i.unit,
        quantityPerYear: i.quantityPerYear,
        remark: i.remark ?? '',
        dataEvidence: i.dataEvidence ?? '',
        ef: i.ef,
        efEvidence: i.efEvidence ?? '',
      };

      // compat
      r.catLabel = r.categoryLabel;
      r.itemName = r.itemLabel;

      rows.push(r);
    };

    // Scope 3.1
    const g31 = {
      tgoNo: 'Scope 3.1',
      scopeIso: 'Scope 4.1 in ISO 14064-1',
      categoryLabel: 'Purchased Goods & Services',
      order: 3.1,
    };

    add(g31, { itemLabel: 'เม็ดพลาสติก LDPE', unit: 'Kg', quantityPerYear: 3887250.0, remark: '', dataEvidence: 'ระบบ ERP', ef: 2.6258, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-6 LDPE' });
    add(g31, { itemLabel: 'เม็ดพลาสติก LLDPE', unit: 'Kg', quantityPerYear: 3753000.0, remark: '', dataEvidence: 'ระบบ ERP', ef: 2.1356, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-5 LLDPE' });
    add(g31, { itemLabel: 'เม็ดพลาสติก HDPE', unit: 'Kg', quantityPerYear: 869250.0, remark: '', dataEvidence: 'ระบบ ERP', ef: 6.7071, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-3 HDPE' });
    add(g31, { itemLabel: 'กระดาษกล่องแป้งหลังเทา', unit: 'Kg', quantityPerYear: 949673.69, remark: '', dataEvidence: 'ระบบ ERP', ef: 1.8679, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-597 กระดาษกล่องขาวเคลือบแป้ง/กระดาษกล่องแป้งหลังเทา' });
    add(g31, { itemLabel: 'กระดาษคราฟท์ ชนิดทาลอน', unit: 'Kg', quantityPerYear: 848073.03, remark: '', dataEvidence: 'ระบบ ERP', ef: 1.6184, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-596 กระดาษคราฟท์ ชนิดท าลอน' });
    add(g31, { itemLabel: 'น้ำประปา (การนิคมฯ)', unit: 'm3', quantityPerYear: 58363.0, remark: '', dataEvidence: 'ใบเสร็จ/ใบแจ้งหนี้ค่าประปา', ef: 0.2575, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-62 น้ำประปา-การนิคมอุตสาหกรรม' });
    add(g31, { itemLabel: 'น้ำประปา (กปน)', unit: 'm3', quantityPerYear: 759.0, remark: '', dataEvidence: 'ใบเสร็จ/ใบแจ้งหนี้ค่าประปา', ef: 0.7948, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-60 น้ำประปา-การประปานครหลวง' });
    add(g31, { itemLabel: 'กระดาษ A4 70 แกรม', unit: 'kg', quantityPerYear: 480.25, remark: '', dataEvidence: 'ใบสั่งซื้อ', ef: 2.102, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-592 กระดาษพิมพ์เขียนแบบไม่เคลือบผิว' });
    add(g31, { itemLabel: 'กระดาษ A4 80 แกรม', unit: 'kg', quantityPerYear: 3043.66, remark: '', dataEvidence: 'ใบสั่งซื้อ', ef: 2.102, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-592 กระดาษพิมพ์เขียนแบบไม่เคลือบผิว' });
    add(g31, { itemLabel: 'ปุ๋ยเคมี 16-16-16', unit: 'Kg', quantityPerYear: 50.0, remark: '', dataEvidence: 'บิลเงินสด', ef: 0.8596, efEvidence: 'TGO guildline' });
    add(g31, { itemLabel: 'น้ำมัน Diesel B7 รถรับส่งพนักงาน', unit: 'L', quantityPerYear: 36567.51, remark: '', dataEvidence: 'ใบแจ้งหนี้', ef: 2.2394, efEvidence: 'TGO-CFO-EF: sheet ET TGO AR5' });
    add(g31, { itemLabel: 'น้ำมัน Diesel B7 รถรับส่งพนักงาน', unit: 'kg', quantityPerYear: 30351.03, remark: '', dataEvidence: 'ใบแจ้งหนี้', ef: 0.3522, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-55 Diesel (น้ำมันดีเซล / น้ำมันโซล่าร์)' });

    // Scope 3.3
    const g33 = {
      tgoNo: 'Scope 3.3',
      scopeIso: 'Scope 2.2 in ISO 14064-1',
      categoryLabel: 'Capital goods',
      order: 3.3,
    };

    add(g33, { itemLabel: 'การได้มาของไฟฟ้า', unit: 'kwh', quantityPerYear: 12873090.23, remark: '', dataEvidence: 'ใบแจ้งหนี้/หนังสือแจ้งค่าไฟฟ้า', ef: 0.0987, efEvidence: 'CFO-EF - CFP-EF-ไฟฟ้า' });
    add(g33, { itemLabel: 'การได้มา Acetylene', unit: 'kg', quantityPerYear: 50.0, remark: '', dataEvidence: 'บิลเงินสด/ใบเสร็จรับเงิน', ef: 2.2804, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-654 acetylene' });
    add(g33, { itemLabel: 'การได้มา Diesel', unit: 'kg', quantityPerYear: 18803.55, remark: '', dataEvidence: 'Fleet card/ใบเสร็จรับเงิน', ef: 0.3522, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-55 Diesel (น้ำมันดีเซล / น้ำมันโซล่าร์)' });
    add(g33, { itemLabel: 'การได้มา Gasoline', unit: 'kg', quantityPerYear: 3181.18, remark: '', dataEvidence: 'Fleet card/ใบเสร็จรับเงิน', ef: 0.4024, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-52 Gasoline (แก๊สโซลีน)' });

    // Scope 3.4
    const g34 = {
      tgoNo: 'Scope 3.4',
      scopeIso: 'Scope 3.1 in ISO 14064-1',
      categoryLabel: 'Upstream transportation and distribution',
      order: 3.4,
    };

    add(g34, { itemLabel: 'รถตู้บรรทุก 10 ล้อ 100% loading', unit: 'tkm', quantityPerYear: 234729.0, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.0454, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-125 รถตู้บรรทุก 10 ล้อ วิ่งปกติ 100% Loading' });
    add(g34, { itemLabel: 'รถตู้บรรทุก 10 ล้อ 0% loading', unit: 'km', quantityPerYear: 14670.56, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.5747, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-122 รถตู้บรรทุก 10 ล้อ วิ่งปกติ 0% Loading' });
    add(g34, { itemLabel: 'รถตู้บรรทุก 6 ล้อ ขนาดใหญ่ 100% loading', unit: 'tkm', quantityPerYear: 241196.53, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.0547, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-109 รถตู้บรรทุก 6 ล้อ ขนาดใหญ่ วิ่งปกติ 100% Loading' });
    add(g34, { itemLabel: 'รถตู้บรรทุก 6 ล้อ ขนาดใหญ่ 0% loading', unit: 'km', quantityPerYear: 21926.96, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.4373, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-106 รถตู้บรรทุก 6 ล้อ ขนาดใหญ่ วิ่งปกติ 0% Loading' });
    add(g34, { itemLabel: 'รถตู้บรรทุก 4 ล้อ 100% loading', unit: 'tkm', quantityPerYear: 779.53, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.1835, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-77 รถตู้บรรทุก 4 ล้อ วิ่งแบบปกติ 100% Loading' });
    add(g34, { itemLabel: 'รถตู้บรรทุก 4 ล้อ 0% loading', unit: 'km', quantityPerYear: 111.36, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.3345, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-74 รถตู้บรรทุก 4 ล้อ วิ่งแบบปกติ 0% Loading' });
    add(g34, { itemLabel: 'เรือบรรทุก container', unit: 'tkm', quantityPerYear: 41061781.04, remark: '', dataEvidence: 'ใบส่งสินค้า/ใบกำกับภาษี', ef: 0.0107, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-255 เรือบรรทุก container' });

    // Scope 3.5
    const g35 = {
      tgoNo: 'Scope 3.5',
      scopeIso: 'Scope 4.3 in ISO 14064-1',
      categoryLabel: 'Waste generated in operations',
      order: 3.5,
    };

    add(g35, { itemLabel: 'ขยะมูลฝอยทั่วไป', unit: 'kg', quantityPerYear: 150000.0, remark: '', dataEvidence: 'ใบกำกับการขนส่งขยะมูลฝอย', ef: 0.7933, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-การฝังกลบขยะมูลฝอยชุมชนแบบถูกหลักสุขาภิบาล' });
    add(g35, { itemLabel: 'ขยะอันตราย', unit: 'kg', quantityPerYear: 680.0, remark: '', dataEvidence: 'ใบกำกับการขนส่งของเสียอันตราย', ef: 0.7933, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-การฝังกลบขยะมูลฝอยชุมชนแบบถูกหลักสุขาภิบาล (แทน)' });
    add(g35, { itemLabel: 'รถกระบะบรรทุก 10 ล้อ วิ่งปกติ 100% loading', unit: 'tkm', quantityPerYear: 31132.93, remark: '', dataEvidence: 'การประมาณการ', ef: 0.0533, efEvidence: '' });
    add(g35, { itemLabel: 'รถกระบะบรรทุก 10 ล้อ วิ่งปกติ 0% loading', unit: 'km', quantityPerYear: 1945.81, remark: '', dataEvidence: 'การประมาณการ', ef: 0.59, efEvidence: '' });
    add(g35, { itemLabel: 'รถบรรทุกขยะ 6 ล้อ 100% loading', unit: 'tkm', quantityPerYear: 6000.0, remark: '', dataEvidence: 'การประมาณการ', ef: 0.0475, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-รถบรรทุกขยะ 6 ล้อ วิ่ง แบบปกติ 100% Loading' });
    add(g35, { itemLabel: 'รถบรรทุกขยะ 6 ล้อ 0% loading', unit: 'km', quantityPerYear: 545.45, remark: '', dataEvidence: 'การประมาณการ', ef: 0.4923, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-รถบรรทุกขยะ 6 ล้อ วิ่งแบบปกติ 0% Loading' });

    // Scope 3.7
    const g37 = {
      tgoNo: 'Scope 3.7',
      scopeIso: 'Scope 3.3 in ISO 14064-1',
      categoryLabel: 'Employee commuting',
      order: 3.7,
    };

    add(g37, { itemLabel: 'น้ำมัน Gasoline จากการเดินทางของพนักงาน', unit: 'L', quantityPerYear: 93466.53, remark: '', dataEvidence: 'แบบสำรวจการเดินทางของพนักงาน', ef: 2.2719, efEvidence: 'TGO-CFO-EF-(เม.ย. 65)-Motor Gasoline - Mobile on road' });
    add(g37, { itemLabel: 'น้ำมัน Diesel จากการเดินทางของพนักงาน', unit: 'L', quantityPerYear: 83378.24, remark: '', dataEvidence: 'แบบสำรวจการเดินทางของพนักงาน', ef: 2.7406, efEvidence: 'TGO-CFO-EF-(เม.ย. 65)-Gas/ Diesel Oil-Mobile on road' });

    // Scope 3.9
    const g39 = {
      tgoNo: 'Scope 3.9',
      scopeIso: 'Scope 3.2 in ISO 14064-1',
      categoryLabel: 'Downstream transportation and distribution',
      order: 3.9,
    };

    add(g39, { itemLabel: 'รถตู้บรรทุกพ่วง 18 ล้อ วิ่งปกติ 100% loading', unit: 'tkm', quantityPerYear: 68783.23, remark: '', dataEvidence: 'Invoice , google map และ เว็ปไซต์ searate', ef: 0.0404, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-รถตู้บรรทุกพ่วง 18 ล้อ วิ่งปกติ 100% loading' });
    add(g39, { itemLabel: 'รถตู้บรรทุกพ่วง 18 ล้อ วิ่งปกติ 0% loading', unit: 'km', quantityPerYear: 2149.48, remark: '', dataEvidence: 'Invoice , google map และ เว็ปไซต์ searate', ef: 0.787, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-รถตู้บรรทุกพ่วง 18 ล้อ วิ่งปกติ 0% loading' });
    add(g39, { itemLabel: 'เรือบรรทุก container', unit: 'tkm', quantityPerYear: 104710480.1, remark: '', dataEvidence: 'Invoice , google map และ เว็ปไซต์ searate', ef: 0.0107, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-เรือบรรทุก container' });

    // Scope 3.12
    const g312 = {
      tgoNo: 'Scope 3.12',
      scopeIso: 'Scope 5 in ISO 14064-1',
      categoryLabel: 'End-of-life treatment of sold products',
      order: 3.12,
    };

    add(g312, { itemLabel: 'การฝังกลบถุงขยะ', unit: 'kg', quantityPerYear: 9710956.43, remark: '', dataEvidence: 'Invoice', ef: 0.7933, efEvidence: 'TGO-CFP-EF-(ก.ค. 65)-การฝังกลบขยะมูลฝอยชุมชนแบบถูกหลักสุขาภิบาล (แทน)' });

    return rows;
  }
}
