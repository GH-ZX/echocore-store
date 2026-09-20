import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=140, bottom=140, start=180, end=180):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{start}" w:type="dxa"/>
            <w:right w:w="{end}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def set_table_borders(table, color="D1D5DB", sz="4"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideH w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="none"/>
            <w:left w:val="none"/>
            <w:right w:val="none"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def make_paragraph(doc, text="", style=None, align=WD_ALIGN_PARAGRAPH.RIGHT, space_before=4, space_after=4):
    p = doc.add_paragraph(text, style=style)
    p.alignment = align
    pPr = p._p.get_or_add_pPr()
    pPr.set(qn('w:bidi'), '1')
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    return p

def add_arabic_run(p, text, font_name="Calibri", size_pt=11, bold=False, italic=False, color_rgb=None):
    run = p.add_run(text)
    run.font.name = font_name
    if size_pt:
        run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    if color_rgb:
        run.font.color.rgb = color_rgb
    
    rPr = run._r.get_or_add_rPr()
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>')
    rPr.append(rFonts)
    rtl = parse_xml(f'<w:rtl {nsdecls("w")}/>')
    rPr.append(rtl)
    return run

def create_callout_box(doc, title, body_lines, border_color="3B82F6", bg_color="EFF6FF"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = tbl._tbl.tblPr
    tblPr.append(parse_xml(f'<w:bidiVisual {nsdecls("w")}/>'))
    
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=160, bottom=160, start=200, end=200)
    
    # Custom right border only (as RTL callout accent)
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:left w:val="none"/>
            <w:bottom w:val="none"/>
            <w:right w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>
        </w:tcBorders>
    ''')
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    pPr = p._p.get_or_add_pPr()
    pPr.set(qn('w:bidi'), '1')
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    add_arabic_run(p, title, font_name="Calibri", size_pt=11.5, bold=True, color_rgb=RGBColor(30, 58, 138))
    
    for line in body_lines:
        p2 = cell.add_paragraph()
        p2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p2Pr = p2._p.get_or_add_pPr()
        p2Pr.set(qn('w:bidi'), '1')
        p2.paragraph_format.space_before = Pt(2)
        p2.paragraph_format.space_after = Pt(2)
        add_arabic_run(p2, line, font_name="Calibri", size_pt=10.5, color_rgb=RGBColor(55, 65, 81))
    
    # Empty spacing paragraph after table
    sp = doc.add_paragraph()
    sp.paragraph_format.space_before = Pt(0)
    sp.paragraph_format.space_after = Pt(6)

def build_partners_doc(output_path):
    doc = docx.Document()
    
    # Set standard page margins (1 inch)
    for s in doc.sections:
        s.top_margin = Inches(0.9)
        s.bottom_margin = Inches(0.9)
        s.left_margin = Inches(0.9)
        s.right_margin = Inches(0.9)
    
    PRIMARY_COLOR = RGBColor(15, 23, 42)      # Slate 900
    ACCENT_COLOR = RGBColor(37, 99, 235)      # Blue 600
    SECONDARY_COLOR = RGBColor(71, 85, 105)   # Slate 600
    SUCCESS_COLOR = RGBColor(16, 185, 129)    # Emerald 500
    DARK_RED = RGBColor(185, 28, 28)

    # Document Header Title
    p_title = make_paragraph(doc, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=4)
    add_arabic_run(p_title, "دليل نظام الشركاء والتسعير بالجملة (Partners)", font_name="Calibri", size_pt=22, bold=True, color_rgb=ACCENT_COLOR)
    
    p_sub = make_paragraph(doc, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18)
    add_arabic_run(p_sub, "منصة ECHOCORE Store • تقرير شامل وشرح آليات التسعير الثابت والتلقائي للتاجر والإدارة", font_name="Calibri", size_pt=12, italic=True, color_rgb=SECONDARY_COLOR)

    # Horizontal divider line via callout or box
    create_callout_box(
        doc,
        "📌 ملخص تنفيذي للمالك والإدارة:",
        [
            "• يتيح قسم الشركاء (Partners) بيع المنتجات لتجار الجملة والموزعين والمؤثرين بأسعار مخفضة تلقائياً بمجرد تسجيل دخولهم.",
            "• النظام يحسب سعر الشريك دائماً انطلاقاً من (تكلفة المورد الحقيقية G2Bulk Cost + نسبة ربح الشريك المحدد للرتبة).",
            "• محمي بحواجز أمان مبرمجة: الشريك لا يمكن أن يدفع أكثر من سعر العميل العادي، ولا يمكن أبداً أن يشتري بأقل من تكلفة المورد (مستحيل الخسارة)."
        ],
        border_color="2563EB",
        bg_color="F0F7FF"
    )

    # SECTION 1
    p_h1 = make_paragraph(doc, space_before=14, space_after=6)
    add_arabic_run(p_h1, "1. ما هو تبويب الشركاء (Partners) وكيف يعمل؟", font_name="Calibri", size_pt=16, bold=True, color_rgb=PRIMARY_COLOR)

    p_p1 = make_paragraph(doc, space_before=2, space_after=6)
    add_arabic_run(p_p1, "قسم الشركاء في لوحة تحكم المتجر ينقسم إلى نظامين متكاملين لإدارة المبيعات الموسعة:", font_name="Calibri", size_pt=11, color_rgb=PRIMARY_COLOR)

    p_item1 = make_paragraph(doc, space_before=2, space_after=4)
    add_arabic_run(p_item1, "أ) رتب الشركاء (Partner Tiers - تجار الجملة): ", font_name="Calibri", size_pt=11.5, bold=True, color_rgb=ACCENT_COLOR)
    add_arabic_run(p_item1, "تقوم بإنشاء فئات للتجار مثل (VIP Wholesaler، تاجر ذهبي، تاجر فضي)، وتحدد لكل رتبة نسبة ربح مئوية محددة (Markup %) تضاف فوق التكلفة. عندما تعيّن مستخدماً في رتبة شريك، يتغير المتجر بالكامل بالنسبة له ليعرض أسعار الجملة الخاصة به بشكل تلقائي ودون الحاجة لأي كوبونات.", font_name="Calibri", size_pt=11, color_rgb=PRIMARY_COLOR)

    p_item2 = make_paragraph(doc, space_before=4, space_after=12)
    add_arabic_run(p_item2, "ب) كوبونات المؤثرين (Influencer Coupons - المسوقين): ", font_name="Calibri", size_pt=11.5, bold=True, color_rgb=ACCENT_COLOR)
    add_arabic_run(p_item2, "إنشاء أكواد خصم للمسوقين (مثل ECHO10) تحدد فيها: نسبة سعر المشتري (تخفيض للزبون)، ونسبة عمولة المؤثر (تُضاف تلقائياً إلى رصيده في الموقع فور إتمام الطلب من أرباح المتجر).", font_name="Calibri", size_pt=11, color_rgb=PRIMARY_COLOR)

    # SECTION 2
    p_h2 = make_paragraph(doc, space_before=14, space_after=6)
    add_arabic_run(p_h2, "2. كيف تُحسب الأسعار؟ (الفرق بين السعر العادي وسعر الشريك)", font_name="Calibri", size_pt=16, bold=True, color_rgb=PRIMARY_COLOR)

    p_p2 = make_paragraph(doc, space_before=2, space_after=6)
    add_arabic_run(p_p2, "لفهم الفرق بدقة، المتجر يحتوي على 3 أوضاع لتسعير المنتجات للزبون العادي، وتتفاعل مع سعر الشريك كالتالي:", font_name="Calibri", size_pt=11, color_rgb=PRIMARY_COLOR)

    # Table explaining the modes
    tbl_modes = doc.add_table(rows=4, cols=3)
    tbl_modes.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_modes._tbl.tblPr.append(parse_xml(f'<w:bidiVisual {nsdecls("w")}/>'))
    set_table_borders(tbl_modes, "CBD5E1")

    headers = ["نوع التسعير في المتجر", "طريقة حساب سعر العميل العادي", "طريقة حساب سعر الشريك (التاجر)"]
    for i, h in enumerate(headers):
        cell = tbl_modes.cell(0, i)
        set_cell_background(cell, "1E293B")
        set_cell_margins(cell, top=120, bottom=120, start=140, end=140)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p._p.get_or_add_pPr().set(qn('w:bidi'), '1')
        add_arabic_run(p, h, font_name="Calibri", size_pt=11, bold=True, color_rgb=RGBColor(255, 255, 255))

    rows_data = [
        (
            "تلقائي (Auto Margin)\n(الوضع الافتراضي)",
            "التكلفة + نسبة ربح المتجر العامة (مثلاً 20%)\nمثال: تكلفة $10 + 20% = $12.00",
            "التكلفة + نسبة رتبة الشريك (مثلاً 5%)\nمثال: تكلفة $10 + 5% = $10.50\n(توفير $1.50 للتاجر)"
        ),
        (
            "هامش مخصص (Custom Margin)\n(يحدده الأدمن للمنتج)",
            "التكلفة + نسبة الربح الخاصة بهذا العرض (مثلاً 15%)\nمثال: تكلفة $10 + 15% = $11.50",
            "التكلفة + نسبة رتبة الشريك (5%)\nمثال: تكلفة $10 + 5% = $10.50\n(توفير $1.00 للتاجر)"
        ),
        (
            "سعر ثابت (Fixed Price)\n(رقم محدد يدوياً للعرض)",
            "السعر الثابت المكتوب يدcontrol (مثلاً $15.00 بغض النظر عن التكلفة)",
            "التكلفة + نسبة رتبة الشريك (5%) = $10.50\n(توفير كبير للتاجر يصل لـ $4.50!)\n* بشرط ألا يتجاوز السعر الثابت"
        ),
    ]

    for row_idx, (col0, col1, col2) in enumerate(rows_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, text in enumerate([col0, col1, col2]):
            cell = tbl_modes.cell(row_idx, c_idx)
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=100, bottom=100, start=120, end=120)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p._p.get_or_add_pPr().set(qn('w:bidi'), '1')
            add_arabic_run(p, text, font_name="Calibri", size_pt=10, color_rgb=PRIMARY_COLOR)

    # Empty paragraph after table
    sp2 = doc.add_paragraph()
    sp2.paragraph_format.space_before = Pt(4)
    sp2.paragraph_format.space_after = Pt(8)

    # SECTION 3: Detailed Numbers Comparison
    p_h3 = make_paragraph(doc, space_before=14, space_after=6)
    add_arabic_run(p_h3, "3. أمثلة عملية رقمية شاملة للفارق بين الأسعار", font_name="Calibri", size_pt=16, bold=True, color_rgb=PRIMARY_COLOR)

    p_p3 = make_paragraph(doc, space_before=2, space_after=6)
    add_arabic_run(p_p3, "الجدول التالي يوضح حركة الأسعار بدقة عبر أمثلة من واقع المتجر (بافتراض رتبة تاجر بنسبة ربح 5%، وهامش المتجر العام 20%):", font_name="Calibri", size_pt=11, color_rgb=PRIMARY_COLOR)

    # Comparison Table
    tbl_compare = doc.add_table(rows=6, cols=6)
    tbl_compare.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_compare._tbl.tblPr.append(parse_xml(f'<w:bidiVisual {nsdecls("w")}/>'))
    set_table_borders(tbl_compare, "CBD5E1")

    comp_headers = [
        "المنتج",
        "تكلفة المورد",
        "نوع التسعير",
        "سعر الزبون العادي",
        "سعر التاجر (الشريك)",
        "الخصم / الفارق للتاجر"
    ]
    for i, h in enumerate(comp_headers):
        cell = tbl_compare.cell(0, i)
        set_cell_background(cell, "0F172A")
        set_cell_margins(cell, top=100, bottom=100, start=100, end=100)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p._p.get_or_add_pPr().set(qn('w:bidi'), '1')
        add_arabic_run(p, h, font_name="Calibri", size_pt=10, bold=True, color_rgb=RGBColor(255, 255, 255))

    comp_rows = [
        ("ببجي 60 شدة", "$0.80", "تلقائي (20%)", "$0.96", "$0.84", "توفير $0.12 (12.5%)"),
        ("فري فاير 1000 جوهرة", "$8.00", "تلقائي (20%)", "$9.60", "$8.40", "توفير $1.20 (12.5%)"),
        ("بطاقة بلايستيشن $50", "$48.50", "هامش مخصص (10%)", "$53.35", "$50.93", "توفير $2.42 (4.5%)"),
        ("اشتراك مميز VIP", "$20.00", "سعر ثابت ($30)", "$30.00", "$21.00", "توفير $9.00 (30.0%)"),
        ("عرض ترويجي مخفض", "$5.00", "سعر ثابت ترويجي ($5.10)", "$5.10", "$5.10*", "نفس سعر العرض (حماية)")
    ]

    for row_idx, r in enumerate(comp_rows, start=1):
        bg = "F1F5F9" if row_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(r):
            cell = tbl_compare.cell(row_idx, c_idx)
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=90, bottom=90, start=100, end=100)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p._p.get_or_add_pPr().set(qn('w:bidi'), '1')
            is_diff = (c_idx == 5)
            is_partner = (c_idx == 4)
            color = SUCCESS_COLOR if is_diff else (ACCENT_COLOR if is_partner else PRIMARY_COLOR)
            add_arabic_run(p, val, font_name="Calibri", size_pt=9.5, bold=(is_diff or is_partner), color_rgb=color)

    # Empty paragraph after table
    sp3 = doc.add_paragraph()
    sp3.paragraph_format.space_before = Pt(2)
    sp3.paragraph_format.space_after = Pt(6)

    # Note about the *
    p_note = make_paragraph(doc, space_before=0, space_after=10)
    add_arabic_run(p_note, "* ملاحظة هامة: ", font_name="Calibri", size_pt=10, bold=True, color_rgb=DARK_RED)
    add_arabic_run(p_note, "في العرض الترويجي ($5.10)، بحساب المعادلة البسيطة 5% على التكلفة يكون الناتج $5.25. ولكن لأن المتجر يطبّق قاعدة (الحد الأقصى لسعر الشريك = سعر المتجر العام)، فإن النظام يبيع للتاجر بـ $5.10 تلقائياً حتى لا يظلم الشريك ويدفع أكثر من الزبون العادي.", font_name="Calibri", size_pt=10, color_rgb=SECONDARY_COLOR)

    # SECTION 4: Rules & Protections
    p_h4 = make_paragraph(doc, space_before=14, space_after=6)
    add_arabic_run(p_h4, "4. قواعد الحماية الصارمة لنظام الشركاء (Financial Guarantees)", font_name="Calibri", size_pt=16, bold=True, color_rgb=PRIMARY_COLOR)

    rules = [
        ("1. حماية التكلفة (Floor Protection):", "مهما بلغت نسبة الخصم أو رتبة الشريك، لا يمكن للنظام أبداً تحت أي ظرف بيع المنتج بأقل من تكلفة المورد الحقيقية (G2Bulk Cost). إذا حاول أي طلب إتمام عملية بيع بربح سالب، ترفض قاعدة البيانات العملية فوراً وتمنع إتمامها."),
        ("2. سرية تكاليف المورد (Wholesale Secrecy):", "الشريك أو التاجر لا يرى في واجهة المتجر سعر التكلفة ولا نسبة الهامش. النظام البرمجي يحذف هذه البيانات تلقائياً قبل إرسالها للواجهة. التاجر يرى فقط سعره المخفض وكلمة (سعر الشريك)."),
        ("3. التحديث اللحظي المباشر (Dynamic Auto-Adjustment):", "إذا ارتفعت تكلفة المنتج لدى مورد G2Bulk، يرتفع سعر الشريك تلقائياً وبشكل فوري ليظل محافظاً على نسبة ربح المتجر المحددة، مما يضمن أمان رأس المال بنسبة 100%."),
        ("4. المنتجات اليدوية بدون تكلفة مورد:", "إذا كان هناك منتج أو بطاقة مضافة يدوياً بدون تكلفة مورد مسجلة، يعاملها النظام بالسعر العام العادي لحين قيام الإدارة بتحديد تكلفتها أو سعرها بدقة.")
    ]

    for title, desc in rules:
        p_r = make_paragraph(doc, space_before=4, space_after=4)
        add_arabic_run(p_r, f"• {title} ", font_name="Calibri", size_pt=11, bold=True, color_rgb=ACCENT_COLOR)
        add_arabic_run(p_r, desc, font_name="Calibri", size_pt=10.5, color_rgb=PRIMARY_COLOR)

    # SECTION 5: How to use AdminPartnersManager
    p_h5 = make_paragraph(doc, space_before=14, space_after=6)
    add_arabic_run(p_h5, "5. خطوات استخدام تبويب الشركاء للأدمن (دليل سريع للمالك)", font_name="Calibri", size_pt=16, bold=True, color_rgb=PRIMARY_COLOR)

    steps = [
        ("الخطوة 1: إنشاء رتبة شريك (Create Tier):", "من لوحة التحكم ← الشركاء (Partners) ← نموذج إضافة رتبة جديدة، أدخل المعرف (مثلاً: gold)، الاسم بالعربي (تاجر ذهبي)، ونسبة الربح (مثلاً: 5%)."),
        ("الخطوة 2: تعيين عميل لرتبة شريك (Assign User):", "في خانة 'تعيين رتبة لمستخدم'، ابحث باسم المستخدم أو إيميله، اختر المستخدم، ثم حدد الرتبة واضغط 'تعيين'. فوراً سيتحول حسابه إلى حساب تاجر جملة."),
        ("الخطوة 3: إنشاء كود مؤثرين (Influencer Coupon):", "أدخل الكود (مثال: YOUTUBER1)، وحدد نسبة المشتري (مثلاً 10% فوق التكلفة لإعطاء الزبائن تخفيضاً)، ونسبة عمولة المؤثر (مثلاً 3% من أرباح كل عملية بيع تذهب لمحفظته)."),
        ("الخطوة 4: التعديل أو الحذف في أي وقت:", "يمكن تعديل نسبة الربح لأي رتبة بضغطة زر وتحديثها فوراً، أو إلغاء رتبة أي مستخدم ليعود عميلاً عادياً بالأسعار العامة.")
    ]

    for title, desc in steps:
        p_s = make_paragraph(doc, space_before=4, space_after=4)
        add_arabic_run(p_s, f"{title} ", font_name="Calibri", size_pt=11, bold=True, color_rgb=PRIMARY_COLOR)
        add_arabic_run(p_s, desc, font_name="Calibri", size_pt=10.5, color_rgb=SECONDARY_COLOR)

    # Footer callout
    create_callout_box(
        doc,
        "💡 نصيحة تسويقية لإدارة المتجر:",
        [
            "• رتبة تاجر الجملة (5% إلى 7% ربح) ممتازة لجذب أصحاب المحلات وموزعي الشدات والجواهر للشراء بكميات ضخمة يومياً والدفع المسبق عبر شحن المحفظة.",
            "• رتبة الشريك البرونزي (10% ربح) مناسبة للأصدقاء والعملاء الدائمين لتشجيعهم على استمرار الشراء الحصري من متجركم.",
            "• بفضل الحماية المشددة في قاعدة البيانات، لن تخسر المنصة دولاراً واحداً من عمليات بيع الجملة مهما تغيرت أسعار السوق."
        ],
        border_color="10B981",
        bg_color="ECFDF5"
    )

    doc.save(output_path)
    print(f"Document successfully created at: {output_path}")

if __name__ == "__main__":
    build_partners_doc(r"C:\Users\Administrator\Coding\echocore-store\ECHOCORE_Partners_Pricing_Guide_AR.docx")
