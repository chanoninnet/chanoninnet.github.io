*&---------------------------------------------------------------------*
*& Report  ZSD_SALES_ORDER_REPORT
*&---------------------------------------------------------------------*
*& Purpose : Sales Order reporting for SAP ERP (SAP ECC 6.0).
*&           Header/Item/Schedule-line/Business/Contract data with the
*&           sold-to name, overall status (code + description) and the
*&           header/item long texts, shown in an interactive ALV grid
*&           with drill-down into VA03. One output row per schedule line.
*&
*& Tables   : VBAK - Sales Document: Header Data
*&            VBAP - Sales Document: Item Data
*&            VBEP - Sales Document: Schedule Line Data
*&            VBKD - Sales Document: Business Data
*&            VBUK - Sales Document: Header Status
*&            VEDA - Contract Data
*&            KNA1 - Customer Master (Sold-to name)
*&            STXH - SAPscript Text File Header (long text existence)
*&
*& Long texts (READ_TEXT):
*&   - Header text : object VBBK / ids 0001, Z020, Z037, Z086 / name VBELN
*&   - Item text   : object VBBP / id 0001 / name VBELN + POSNR
*&
*& Status description : fixed values of domain STATV.
*& Double-click on a row opens the sales order in VA03.
*&---------------------------------------------------------------------*
REPORT zsd_sales_order_report LINE-SIZE 1023.

*&---------------------------------------------------------------------*
*& Type pools
*&---------------------------------------------------------------------*
TYPE-POOLS: slis.

*&---------------------------------------------------------------------*
*& Tables (work area needed for SELECT-OPTIONS references)
*&---------------------------------------------------------------------*
TABLES: vbak.

*&---------------------------------------------------------------------*
*& Global types
*&---------------------------------------------------------------------*
* Output line - columns in the requested order, texts appended last.
TYPES: BEGIN OF ty_output,
         vbeln     TYPE vbak-vbeln,
         posnr     TYPE vbap-posnr,
         etenr     TYPE vbep-etenr,
         selkz     TYPE c LENGTH 1,
         arktx     TYPE vbap-arktx,
         auart     TYPE vbak-auart,
         audat     TYPE vbak-audat,
         bmeng     TYPE vbep-bmeng,
         bstnk     TYPE vbak-bstnk,
         bstkd     TYPE vbkd-bstkd,
         charg     TYPE vbap-charg,
         datab     TYPE d,
         datbi     TYPE d,
         edatu     TYPE vbep-edatu,
         ernam     TYPE vbak-ernam,
         faksk     TYPE vbak-faksk,
         kunnr     TYPE vbak-kunnr,
         kursk     TYPE vbkd-kursk,
         kwmeng    TYPE vbap-kwmeng,
         lgort     TYPE vbap-lgort,
         lifsk     TYPE vbak-lifsk,
         matnr     TYPE vbap-matnr,
         meins     TYPE vbap-meins,
         name1     TYPE kna1-name1,
         csepr     TYPE vbap-netpr,
         csein     TYPE vbap-kpein,
         cmein     TYPE vbap-kmein,
         cwaer     TYPE vbak-waerk,
         netpr     TYPE vbap-netpr,
         kpein     TYPE vbap-kpein,
         kmein     TYPE vbap-kmein,
         netwr_ak  TYPE vbak-netwr,
         netwr     TYPE vbap-netwr,
         spart     TYPE vbak-spart,
         status    TYPE vbuk-gbstk,
         statu     TYPE dd07v-ddtext,
         vkbur     TYPE vbak-vkbur,
         vkgrp     TYPE vbak-vkgrp,
         vkorg     TYPE vbak-vkorg,
         vrkme     TYPE vbap-vrkme,
         vstel     TYPE vbap-vstel,
         vtweg     TYPE vbak-vtweg,
         wadat     TYPE vbep-wadat,
         waerk     TYPE vbak-waerk,
         werks     TYPE vbap-werks,
         wmeng     TYPE vbep-wmeng,
         ktext     TYPE vbak-ktext,
         augru     TYPE vbak-augru,
         abgru     TYPE vbap-abgru,
         awahr     TYPE vbap-awahr,
         adrnr     TYPE adrnr,
         vbtyp     TYPE vbak-vbtyp,
         shkzg     TYPE vbap-shkzg,
         activ     TYPE c LENGTH 1,
         prsdt     TYPE vbkd-prsdt,
         kursk_dat TYPE d,
         kurrf_dat TYPE d,
         kurst     TYPE vbak-kurst,
         vlaufz    TYPE veda-vlaufz,
         vlauez    TYPE veda-vlauez,
         vlaufk    TYPE veda-vlaufk,
         vinsdat   TYPE veda-vinsdat,
         vabndat   TYPE veda-vabndat,
         vuntdat   TYPE veda-vuntdat,
         vkuesch   TYPE veda-vkuesch,
         vaktsch   TYPE veda-vaktsch,
         veindat   TYPE veda-veindat,
         vwundat   TYPE veda-vwundat,
         vkuepar   TYPE veda-vkuepar,
         vkuegru   TYPE veda-vkuegru,
         vbelkue   TYPE veda-vbelkue,
         vbedkue   TYPE veda-vbedkue,
         vdemdat   TYPE veda-vdemdat,
         vasda     TYPE veda-vasda,
         aktvt     TYPE c LENGTH 3,
         bezei     TYPE c LENGTH 40,
         erdat     TYPE vbak-erdat,
         erzet     TYPE vbak-erzet,
*        long texts (appended after the requested columns)
         header_text TYPE string,
         text_z020   TYPE string,
         text_z037   TYPE string,
         text_z086   TYPE string,
         item_text   TYPE string,
       END OF ty_output.

* Lean schedule-line buffer (VBEP)
TYPES: BEGIN OF ty_vbep,
         vbeln TYPE vbep-vbeln,
         posnr TYPE vbep-posnr,
         etenr TYPE vbep-etenr,
         edatu TYPE vbep-edatu,
         bmeng TYPE vbep-bmeng,
         wmeng TYPE vbep-wmeng,
         wadat TYPE vbep-wadat,
       END OF ty_vbep.

* Lean business-data buffer (VBKD)
TYPES: BEGIN OF ty_vbkd,
         vbeln TYPE vbkd-vbeln,
         posnr TYPE vbkd-posnr,
         bstkd TYPE vbkd-bstkd,
         prsdt TYPE vbkd-prsdt,
         kursk TYPE vbkd-kursk,
       END OF ty_vbkd.

* Sold-to name buffer (KUNNR -> NAME1)
TYPES: BEGIN OF ty_kna1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
       END OF ty_kna1.

* Driver table for the STXH FOR ALL ENTRIES read (TDNAME is CHAR 70)
TYPES: BEGIN OF ty_name,
         tdname TYPE stxh-tdname,
       END OF ty_name.

* Domain fixed-value text buffer (single-char status -> description)
TYPES: BEGIN OF ty_statv,
         domvalue TYPE dd07v-domvalue_l,
         ddtext   TYPE dd07v-ddtext,
       END OF ty_statv.

* Text-ID description buffer (TDID -> description, from TTXIT)
TYPES: BEGIN OF ty_ttxit,
         tdid   TYPE ttxit-tdid,
         tdtext TYPE ttxit-tdtext,
       END OF ty_ttxit.

*&---------------------------------------------------------------------*
*& Global data
*&---------------------------------------------------------------------*
DATA: gt_vbak   TYPE STANDARD TABLE OF vbak,
      gt_vbap   TYPE STANDARD TABLE OF vbap,
      gt_vbep   TYPE STANDARD TABLE OF ty_vbep,
      gt_vbkd   TYPE STANDARD TABLE OF ty_vbkd,
      gt_vbuk   TYPE STANDARD TABLE OF vbuk,
      gt_veda   TYPE STANDARD TABLE OF veda,
      gt_kna1   TYPE STANDARD TABLE OF ty_kna1,
      gt_stxh   TYPE STANDARD TABLE OF stxh,   " header text index (VBBK)
      gt_stxi   TYPE STANDARD TABLE OF stxh,   " item text index   (VBBP)
      gt_statv  TYPE STANDARD TABLE OF ty_statv,
      gs_statv  TYPE ty_statv,
      gt_ttxit  TYPE STANDARD TABLE OF ty_ttxit,
      gs_ttxit  TYPE ty_ttxit,
      gt_names  TYPE STANDARD TABLE OF ty_name,
      gs_name   TYPE ty_name,
      gt_output TYPE STANDARD TABLE OF ty_output,
      gs_output TYPE ty_output.

DATA: gt_fieldcat TYPE slis_t_fieldcat_alv,
      gs_layout   TYPE slis_layout_alv.

* Header text IDs to read: standard note 0001 plus custom Z-texts.
* RANGES (classic) is used instead of TYPE RANGE OF for old-release
* compatibility.
RANGES: gr_tdid FOR stxh-tdid.

*&---------------------------------------------------------------------*
*& Selection screen
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-s01.
SELECT-OPTIONS: s_vbeln FOR vbak-vbeln,   " Sales Document
                s_auart FOR vbak-auart,   " Order Type
                s_vkorg FOR vbak-vkorg,   " Sales Organization
                s_kunnr FOR vbak-kunnr,   " Sold-to Party
                s_erdat FOR vbak-erdat.   " Created On
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-s02.
PARAMETERS: p_text  AS CHECKBOX DEFAULT 'X',   " Read Header Long Text
            p_itext AS CHECKBOX DEFAULT 'X'.   " Read Item Long Text
SELECTION-SCREEN END OF BLOCK b2.

*&---------------------------------------------------------------------*
*& Main
*&---------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM get_data.
  PERFORM build_output.

END-OF-SELECTION.
  IF gt_output IS INITIAL.
    MESSAGE 'No sales orders found for the given selection' TYPE 'S'
            DISPLAY LIKE 'W'.
  ELSE.
    PERFORM build_fieldcat.
    PERFORM display_alv.
  ENDIF.

*&---------------------------------------------------------------------*
*&      Form  GET_DATA
*&---------------------------------------------------------------------*
FORM get_data.

  DATA: ls_vbak TYPE vbak,
        ls_vbap TYPE vbap,
        lv_name TYPE stxh-tdname.

* --- Sales Order Header (VBAK) ---
  SELECT * FROM vbak
    INTO TABLE gt_vbak
    WHERE vbeln IN s_vbeln
      AND auart IN s_auart
      AND vkorg IN s_vkorg
      AND kunnr IN s_kunnr
      AND erdat IN s_erdat.

  IF gt_vbak IS INITIAL.
    RETURN.
  ENDIF.

* --- Sales Order Item (VBAP) ---
  SELECT * FROM vbap
    INTO TABLE gt_vbap
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Schedule Lines (VBEP) ---
  SELECT vbeln posnr etenr edatu bmeng wmeng wadat
    FROM vbep
    INTO TABLE gt_vbep
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Business Data (VBKD) ---
  SELECT vbeln posnr bstkd prsdt kursk
    FROM vbkd
    INTO TABLE gt_vbkd
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Header Status (VBUK) ---
  SELECT * FROM vbuk
    INTO TABLE gt_vbuk
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Contract Data (VEDA) ---
  SELECT * FROM veda
    INTO TABLE gt_veda
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Sold-to name (KNA1) ---
  SELECT kunnr name1 FROM kna1
    INTO TABLE gt_kna1
    FOR ALL ENTRIES IN gt_vbak
    WHERE kunnr = gt_vbak-kunnr.

* --- Build the header text-ID range (0001 + Z020 / Z037 / Z086) ---
  REFRESH gr_tdid.
  gr_tdid-sign = 'I'.
  gr_tdid-option = 'EQ'.
  gr_tdid-low = '0001'. APPEND gr_tdid.
  gr_tdid-low = 'Z020'. APPEND gr_tdid.
  gr_tdid-low = 'Z037'. APPEND gr_tdid.
  gr_tdid-low = 'Z086'. APPEND gr_tdid.

* --- Header Text index (STXH) : object VBBK / ids in gr_tdid ---
  IF p_text = abap_true.
    CLEAR gt_names.
    LOOP AT gt_vbak INTO ls_vbak.
      CLEAR gs_name.
      gs_name-tdname = ls_vbak-vbeln.
      APPEND gs_name TO gt_names.
    ENDLOOP.

    IF gt_names IS NOT INITIAL.
      SELECT * FROM stxh
        INTO TABLE gt_stxh
        FOR ALL ENTRIES IN gt_names
        WHERE tdobject = 'VBBK'
          AND tdname   = gt_names-tdname
          AND tdid     IN gr_tdid.
    ENDIF.

*   Text-ID descriptions (TTXIT) for the column headings
    SELECT tdid tdtext FROM ttxit
      INTO TABLE gt_ttxit
      WHERE tdobject = 'VBBK'
        AND tdspras  = sy-langu
        AND tdid     IN gr_tdid.
    SORT gt_ttxit BY tdid.
  ENDIF.

* --- Item Text index (STXH) : object VBBP / id 0001 ---
  IF p_itext = abap_true.
    CLEAR gt_names.
    LOOP AT gt_vbap INTO ls_vbap.
      CLEAR gs_name.
      CONCATENATE ls_vbap-vbeln ls_vbap-posnr INTO lv_name.
      gs_name-tdname = lv_name.
      APPEND gs_name TO gt_names.
    ENDLOOP.

    IF gt_names IS NOT INITIAL.
      SELECT * FROM stxh
        INTO TABLE gt_stxi
        FOR ALL ENTRIES IN gt_names
        WHERE tdobject = 'VBBP'
          AND tdname   = gt_names-tdname
          AND tdid     = '0001'.
    ENDIF.
  ENDIF.

* --- Status descriptions (domain STATV fixed values) ---
  PERFORM load_status_texts.

* Sort internal tables for fast READ TABLE ... BINARY SEARCH
  SORT gt_vbap BY vbeln posnr.
  SORT gt_vbep BY vbeln posnr etenr.
  SORT gt_vbkd BY vbeln posnr.
  SORT gt_vbuk BY vbeln.
  SORT gt_veda BY vbeln vposn.
  SORT gt_kna1 BY kunnr.
  SORT gt_stxh BY tdname tdid.
  SORT gt_stxi BY tdname.

ENDFORM.                    "get_data

*&---------------------------------------------------------------------*
*&      Form  LOAD_STATUS_TEXTS
*&---------------------------------------------------------------------*
FORM load_status_texts.

  DATA: lt_dd07v TYPE STANDARD TABLE OF dd07v,
        ls_dd07v TYPE dd07v.

  CALL FUNCTION 'DD_DOMVALUES_GET'
    EXPORTING
      domname        = 'STATV'
      text           = 'X'
      langu          = sy-langu
    TABLES
      dd07v_tab      = lt_dd07v
    EXCEPTIONS
      wrong_textflag = 1
      OTHERS         = 2.

  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT lt_dd07v INTO ls_dd07v.
    CLEAR gs_statv.
    gs_statv-domvalue = ls_dd07v-domvalue_l.
    gs_statv-ddtext   = ls_dd07v-ddtext.
    APPEND gs_statv TO gt_statv.
  ENDLOOP.

  SORT gt_statv BY domvalue.

ENDFORM.                    "load_status_texts

*&---------------------------------------------------------------------*
*&      Form  STATUS_TEXT
*&---------------------------------------------------------------------*
FORM status_text USING    iv_code TYPE c
                 CHANGING cv_text TYPE dd07v-ddtext.

  CLEAR cv_text.
  IF iv_code IS INITIAL.
    RETURN.
  ENDIF.

  READ TABLE gt_statv INTO gs_statv
       WITH KEY domvalue = iv_code BINARY SEARCH.
  IF sy-subrc = 0.
    cv_text = gs_statv-ddtext.
  ENDIF.

ENDFORM.                    "status_text

*&---------------------------------------------------------------------*
*&      Form  BUILD_OUTPUT
*&---------------------------------------------------------------------*
*&      One output row per schedule line (per item if no schedule line,
*&      per header if no item).
*&---------------------------------------------------------------------*
FORM build_output.

  DATA: ls_vbak  TYPE vbak,
        ls_vbap  TYPE vbap,
        ls_vbep  TYPE ty_vbep,
        ls_vbkd  TYPE ty_vbkd,
        ls_vbuk  TYPE vbuk,
        ls_veda  TYPE veda,
        ls_kna1  TYPE ty_kna1,
        lv_status_txt TYPE dd07v-ddtext,
        lv_name1 TYPE kna1-name1,
        lv_htext TYPE string,
        lv_z020  TYPE string,
        lv_z037  TYPE string,
        lv_z086  TYPE string,
        lv_itext TYPE string,
        lv_found TYPE flag.

  LOOP AT gt_vbak INTO ls_vbak.

*   Header status (VBUK)
    CLEAR ls_vbuk.
    READ TABLE gt_vbuk INTO ls_vbuk
         WITH KEY vbeln = ls_vbak-vbeln BINARY SEARCH.
    PERFORM status_text USING ls_vbuk-gbstk CHANGING lv_status_txt.

*   Sold-to name (KNA1)
    CLEAR lv_name1.
    READ TABLE gt_kna1 INTO ls_kna1
         WITH KEY kunnr = ls_vbak-kunnr BINARY SEARCH.
    IF sy-subrc = 0.
      lv_name1 = ls_kna1-name1.
    ENDIF.

*   Contract data (VEDA) - header level (VPOSN = 000000)
    CLEAR ls_veda.
    READ TABLE gt_veda INTO ls_veda
         WITH KEY vbeln = ls_vbak-vbeln
                  vposn = '000000' BINARY SEARCH.

*   Header long texts (once per header)
    CLEAR: lv_htext, lv_z020, lv_z037, lv_z086.
    IF p_text = abap_true.
      PERFORM read_header_text_id USING ls_vbak-vbeln '0001' CHANGING lv_htext.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z020' CHANGING lv_z020.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z037' CHANGING lv_z037.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z086' CHANGING lv_z086.
    ENDIF.

*   Items
    LOOP AT gt_vbap INTO ls_vbap WHERE vbeln = ls_vbak-vbeln.

*     Business data (VBKD) - item, fall back to header 000000
      CLEAR ls_vbkd.
      READ TABLE gt_vbkd INTO ls_vbkd
           WITH KEY vbeln = ls_vbap-vbeln
                    posnr = ls_vbap-posnr BINARY SEARCH.
      IF sy-subrc <> 0.
        READ TABLE gt_vbkd INTO ls_vbkd
             WITH KEY vbeln = ls_vbap-vbeln
                      posnr = '000000' BINARY SEARCH.
      ENDIF.

*     Item long text
      CLEAR lv_itext.
      IF p_itext = abap_true.
        PERFORM read_item_text USING ls_vbap-vbeln ls_vbap-posnr
                            CHANGING lv_itext.
      ENDIF.

*     Schedule lines (VBEP) - one output row each
      lv_found = space.
      LOOP AT gt_vbep INTO ls_vbep
           WHERE vbeln = ls_vbap-vbeln
             AND posnr = ls_vbap-posnr.
        lv_found = 'X'.
        PERFORM fill_row USING ls_vbak ls_vbap ls_vbep ls_vbkd
                               ls_vbuk ls_veda
                               lv_name1 lv_status_txt
                               lv_htext lv_z020 lv_z037 lv_z086 lv_itext.
      ENDLOOP.

*     Item without schedule line - still one row
      IF lv_found = space.
        CLEAR ls_vbep.
        PERFORM fill_row USING ls_vbak ls_vbap ls_vbep ls_vbkd
                               ls_vbuk ls_veda
                               lv_name1 lv_status_txt
                               lv_htext lv_z020 lv_z037 lv_z086 lv_itext.
      ENDIF.

    ENDLOOP.

*   Header without items - still one row
    IF sy-subrc <> 0.
      CLEAR: ls_vbap, ls_vbep, ls_vbkd.
      PERFORM fill_row USING ls_vbak ls_vbap ls_vbep ls_vbkd
                             ls_vbuk ls_veda
                             lv_name1 lv_status_txt
                             lv_htext lv_z020 lv_z037 lv_z086 lv_itext.
    ENDIF.

  ENDLOOP.

ENDFORM.                    "build_output

*&---------------------------------------------------------------------*
*&      Form  FILL_ROW
*&---------------------------------------------------------------------*
*&      Map the current header/item/schedule/business/contract records
*&      into one output row and append it.
*&---------------------------------------------------------------------*
FORM fill_row USING is_vbak TYPE vbak
                    is_vbap TYPE vbap
                    is_vbep TYPE ty_vbep
                    is_vbkd TYPE ty_vbkd
                    is_vbuk TYPE vbuk
                    is_veda TYPE veda
                    iv_name1      TYPE kna1-name1
                    iv_status_txt TYPE dd07v-ddtext
                    iv_htext TYPE string
                    iv_z020  TYPE string
                    iv_z037  TYPE string
                    iv_z086  TYPE string
                    iv_itext TYPE string.

  CLEAR gs_output.

* Contract data (VEDA) - fills matching VLAUFZ..VASDA fields by name
  MOVE-CORRESPONDING is_veda TO gs_output.

* Header (VBAK)
  gs_output-vbeln    = is_vbak-vbeln.
  gs_output-auart    = is_vbak-auart.
  gs_output-audat    = is_vbak-audat.
  gs_output-bstnk    = is_vbak-bstnk.
  gs_output-ernam    = is_vbak-ernam.
  gs_output-faksk    = is_vbak-faksk.
  gs_output-kunnr    = is_vbak-kunnr.
  gs_output-kurst    = is_vbak-kurst.
  gs_output-lifsk    = is_vbak-lifsk.
  gs_output-spart    = is_vbak-spart.
  gs_output-vkbur    = is_vbak-vkbur.
  gs_output-vkgrp    = is_vbak-vkgrp.
  gs_output-vkorg    = is_vbak-vkorg.
  gs_output-vtweg    = is_vbak-vtweg.
  gs_output-waerk    = is_vbak-waerk.
  gs_output-cwaer    = is_vbak-waerk.
  gs_output-augru    = is_vbak-augru.
  gs_output-vbtyp    = is_vbak-vbtyp.
  gs_output-ktext    = is_vbak-ktext.
  gs_output-netwr_ak = is_vbak-netwr.
  gs_output-erdat    = is_vbak-erdat.
  gs_output-erzet    = is_vbak-erzet.
  gs_output-name1    = iv_name1.

* Item (VBAP)
  gs_output-posnr    = is_vbap-posnr.
  gs_output-arktx    = is_vbap-arktx.
  gs_output-charg    = is_vbap-charg.
  gs_output-kwmeng   = is_vbap-kwmeng.
  gs_output-lgort    = is_vbap-lgort.
  gs_output-matnr    = is_vbap-matnr.
  gs_output-meins    = is_vbap-meins.
  gs_output-netpr    = is_vbap-netpr.
  gs_output-kpein    = is_vbap-kpein.
  gs_output-kmein    = is_vbap-kmein.
  gs_output-netwr    = is_vbap-netwr.
  gs_output-vrkme    = is_vbap-vrkme.
  gs_output-vstel    = is_vbap-vstel.
  gs_output-werks    = is_vbap-werks.
  gs_output-abgru    = is_vbap-abgru.
  gs_output-awahr    = is_vbap-awahr.
  gs_output-shkzg    = is_vbap-shkzg.

* Schedule line (VBEP)
  gs_output-etenr    = is_vbep-etenr.
  gs_output-edatu    = is_vbep-edatu.
  gs_output-bmeng    = is_vbep-bmeng.
  gs_output-wmeng    = is_vbep-wmeng.
  gs_output-wadat    = is_vbep-wadat.

* Business data (VBKD)
  gs_output-bstkd    = is_vbkd-bstkd.
  gs_output-prsdt    = is_vbkd-prsdt.
  gs_output-kursk    = is_vbkd-kursk.

* Status (VBUK) - code + description
  gs_output-status   = is_vbuk-gbstk.
  gs_output-statu    = iv_status_txt.

* Long texts
  gs_output-header_text = iv_htext.
  gs_output-text_z020   = iv_z020.
  gs_output-text_z037   = iv_z037.
  gs_output-text_z086   = iv_z086.
  gs_output-item_text   = iv_itext.

  APPEND gs_output TO gt_output.

ENDFORM.                    "fill_row

*&---------------------------------------------------------------------*
*&      Form  READ_HEADER_TEXT_ID
*&---------------------------------------------------------------------*
FORM read_header_text_id USING    iv_vbeln TYPE vbak-vbeln
                                  iv_tdid  TYPE stxh-tdid
                         CHANGING cv_text  TYPE string.

  DATA: lt_lines TYPE STANDARD TABLE OF tline,
        ls_line  TYPE tline,
        lv_name  TYPE thead-tdname.

  CLEAR cv_text.

  READ TABLE gt_stxh TRANSPORTING NO FIELDS
       WITH KEY tdname = iv_vbeln
                tdid   = iv_tdid BINARY SEARCH.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  lv_name = iv_vbeln.

  CALL FUNCTION 'READ_TEXT'
    EXPORTING
      id                      = iv_tdid
      language                = sy-langu
      name                    = lv_name
      object                  = 'VBBK'
    TABLES
      lines                   = lt_lines
    EXCEPTIONS
      id                      = 1
      language                = 2
      name                    = 3
      not_found               = 4
      object                  = 5
      reference_check         = 6
      wrong_access_to_archive = 7
      OTHERS                  = 8.

  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT lt_lines INTO ls_line.
    IF cv_text IS INITIAL.
      cv_text = ls_line-tdline.
    ELSE.
      CONCATENATE cv_text ls_line-tdline INTO cv_text SEPARATED BY space.
    ENDIF.
  ENDLOOP.

ENDFORM.                    "read_header_text_id

*&---------------------------------------------------------------------*
*&      Form  GET_ID_DESC
*&---------------------------------------------------------------------*
FORM get_id_desc USING    iv_tdid TYPE stxh-tdid
                 CHANGING cv_desc TYPE ttxit-tdtext.

  READ TABLE gt_ttxit INTO gs_ttxit
       WITH KEY tdid = iv_tdid BINARY SEARCH.
  IF sy-subrc = 0 AND gs_ttxit-tdtext IS NOT INITIAL.
    cv_desc = gs_ttxit-tdtext.
  ELSE.
    CONCATENATE 'Header Text' iv_tdid INTO cv_desc SEPARATED BY space.
  ENDIF.

ENDFORM.                    "get_id_desc

*&---------------------------------------------------------------------*
*&      Form  READ_ITEM_TEXT
*&---------------------------------------------------------------------*
FORM read_item_text USING    iv_vbeln TYPE vbap-vbeln
                             iv_posnr TYPE vbap-posnr
                    CHANGING cv_text  TYPE string.

  DATA: lt_lines TYPE STANDARD TABLE OF tline,
        ls_line  TYPE tline,
        lv_name  TYPE thead-tdname.

  CONCATENATE iv_vbeln iv_posnr INTO lv_name.

  READ TABLE gt_stxi TRANSPORTING NO FIELDS
       WITH KEY tdname = lv_name BINARY SEARCH.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  CALL FUNCTION 'READ_TEXT'
    EXPORTING
      id                      = '0001'
      language                = sy-langu
      name                    = lv_name
      object                  = 'VBBP'
    TABLES
      lines                   = lt_lines
    EXCEPTIONS
      id                      = 1
      language                = 2
      name                    = 3
      not_found               = 4
      object                  = 5
      reference_check         = 6
      wrong_access_to_archive = 7
      OTHERS                  = 8.

  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT lt_lines INTO ls_line.
    IF cv_text IS INITIAL.
      cv_text = ls_line-tdline.
    ELSE.
      CONCATENATE cv_text ls_line-tdline INTO cv_text SEPARATED BY space.
    ENDIF.
  ENDLOOP.

ENDFORM.                    "read_item_text

*&---------------------------------------------------------------------*
*&      Form  BUILD_FIELDCAT
*&---------------------------------------------------------------------*
FORM build_fieldcat.

  DEFINE add_field.
    CLEAR gs_fieldcat.
    gs_fieldcat-fieldname = &1.
    gs_fieldcat-seltext_l = &2.
    gs_fieldcat-seltext_m = &2.
    gs_fieldcat-seltext_s = &2.
    gs_fieldcat-outputlen = &3.
    APPEND gs_fieldcat TO gt_fieldcat.
  END-OF-DEFINITION.

  DATA: gs_fieldcat TYPE slis_fieldcat_alv,
        lv_d020     TYPE ttxit-tdtext,
        lv_d037     TYPE ttxit-tdtext,
        lv_d086     TYPE ttxit-tdtext.

  PERFORM get_id_desc USING 'Z020' CHANGING lv_d020.
  PERFORM get_id_desc USING 'Z037' CHANGING lv_d037.
  PERFORM get_id_desc USING 'Z086' CHANGING lv_d086.

* --- Columns in the requested order ---
  add_field 'VBELN'     'Sales Document'     10.
  add_field 'POSNR'     'Item'                6.
  add_field 'ETENR'     'Sched. Line'         4.
  add_field 'SELKZ'     'Sel.'                1.
  add_field 'ARKTX'     'Description'        40.
  add_field 'AUART'     'Order Type'          4.
  add_field 'AUDAT'     'Doc. Date'          10.
  add_field 'BMENG'     'Confirmed Qty'      15.
  add_field 'BSTNK'     'PO Number'          20.
  add_field 'BSTKD'     'PO (Item)'          35.
  add_field 'CHARG'     'Batch'              10.
  add_field 'DATAB'     'Valid From'         10.
  add_field 'DATBI'     'Valid To'           10.
  add_field 'EDATU'     'Sched. Date'        10.
  add_field 'ERNAM'     'Created By'         12.
  add_field 'FAKSK'     'Bill. Block'         2.
  add_field 'KUNNR'     'Sold-to'            10.
  add_field 'KURSK'     'Exch. Rate'         12.
  add_field 'KWMENG'    'Order Qty'          15.
  add_field 'LGORT'     'Stor. Loc.'          4.
  add_field 'LIFSK'     'Deliv. Block'        2.
  add_field 'MATNR'     'Material'           18.
  add_field 'MEINS'     'Base Unit'           3.
  add_field 'NAME1'     'Sold-to Name'       35.
  add_field 'CSEPR'     'Credit Price'       15.
  add_field 'CSEIN'     'Credit Per'         10.
  add_field 'CMEIN'     'Credit Unit'         3.
  add_field 'CWAER'     'Credit Curr.'        5.
  add_field 'NETPR'     'Net Price'          15.
  add_field 'KPEIN'     'Price Unit'         10.
  add_field 'KMEIN'     'Cond. Unit'          3.
  add_field 'NETWR_AK'  'Net Value (Hdr)'    15.
  add_field 'NETWR'     'Net Value (Item)'   15.
  add_field 'SPART'     'Division'            2.
  add_field 'STATUS'    'Status'              3.
  add_field 'STATU'     'Status Desc'        20.
  add_field 'VKBUR'     'Sales Office'        4.
  add_field 'VKGRP'     'Sales Group'         3.
  add_field 'VKORG'     'Sales Org.'          4.
  add_field 'VRKME'     'Sales Unit'          3.
  add_field 'VSTEL'     'Ship. Point'         4.
  add_field 'VTWEG'     'Distr. Ch.'          2.
  add_field 'WADAT'     'GI Date'            10.
  add_field 'WAERK'     'Currency'            5.
  add_field 'WERKS'     'Plant'               4.
  add_field 'WMENG'     'Sched. Qty'         15.
  add_field 'KTEXT'     'Search Text'        40.
  add_field 'AUGRU'     'Order Reason'        3.
  add_field 'ABGRU'     'Rej. Reason'         2.
  add_field 'AWAHR'     'Probability'         3.
  add_field 'ADRNR'     'Address No.'        10.
  add_field 'VBTYP'     'Doc. Cat.'           1.
  add_field 'SHKZG'     'D/C Ind.'            1.
  add_field 'ACTIV'     'Active'              1.
  add_field 'PRSDT'     'Pricing Date'       10.
  add_field 'KURSK_DAT' 'Exch.Rate Date'     10.
  add_field 'KURRF_DAT' 'Acct.Rate Date'     10.
  add_field 'KURST'     'Rate Type'           4.
  add_field 'VLAUFZ'    'Contract Dur.'      10.
  add_field 'VLAUEZ'    'Dur. Unit'           4.
  add_field 'VLAUFK'    'Dur. Cat.'           1.
  add_field 'VINSDAT'   'Install Date'       10.
  add_field 'VABNDAT'   'Accept. Date'       10.
  add_field 'VUNTDAT'   'Signed Date'        10.
  add_field 'VKUESCH'   'Cancel. Proc.'       4.
  add_field 'VAKTSCH'   'Activ. Rule'         4.
  add_field 'VEINDAT'   'Entry Date'         10.
  add_field 'VWUNDAT'   'Requested Date'     10.
  add_field 'VKUEPAR'   'Cancel. Party'       1.
  add_field 'VKUEGRU'   'Cancel. Reason'      4.
  add_field 'VBELKUE'   'Cancel. Doc.'       10.
  add_field 'VBEDKUE'   'Cancel. Item'        6.
  add_field 'VDEMDAT'   'Deemed Date'        10.
  add_field 'VASDA'     'Contract Date'      10.
  add_field 'AKTVT'     'Activity'            3.
  add_field 'BEZEI'     'Description'        40.
  add_field 'ERDAT'     'Created On'         10.
  add_field 'ERZET'     'Created At'          8.

* --- Long-text columns last ---
  add_field 'HEADER_TEXT' 'Header Text (0001)' 60.
  add_field 'TEXT_Z020'   lv_d020              60.
  add_field 'TEXT_Z037'   lv_d037              60.
  add_field 'TEXT_Z086'   lv_d086              60.
  add_field 'ITEM_TEXT'   'Item Text'          60.

ENDFORM.                    "build_fieldcat

*&---------------------------------------------------------------------*
*&      Form  DISPLAY_ALV
*&---------------------------------------------------------------------*
FORM display_alv.

  gs_layout-colwidth_optimize = abap_true.
  gs_layout-zebra             = abap_true.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program       = sy-repid
      i_callback_user_command  = 'USER_COMMAND'
      is_layout                = gs_layout
      it_fieldcat              = gt_fieldcat
      i_save                   = 'A'
    TABLES
      t_outtab                 = gt_output
    EXCEPTIONS
      program_error            = 1
      OTHERS                   = 2.

  IF sy-subrc <> 0.
    MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
  ENDIF.

ENDFORM.                    "display_alv

*&---------------------------------------------------------------------*
*&      Form  USER_COMMAND
*&---------------------------------------------------------------------*
*&      Double-click (&IC1) opens the sales order in VA03.
*&---------------------------------------------------------------------*
FORM user_command USING r_ucomm     TYPE sy-ucomm
                        rs_selfield TYPE slis_selfield.

  CASE r_ucomm.
    WHEN '&IC1'.
      CLEAR gs_output.
      READ TABLE gt_output INTO gs_output INDEX rs_selfield-tabindex.
      IF sy-subrc = 0 AND gs_output-vbeln IS NOT INITIAL.
        SET PARAMETER ID 'AUN' FIELD gs_output-vbeln.
        CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
      ENDIF.
  ENDCASE.

ENDFORM.                    "user_command
