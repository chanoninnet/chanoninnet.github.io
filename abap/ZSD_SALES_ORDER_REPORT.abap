*&---------------------------------------------------------------------*
*& Report  ZSD_SALES_ORDER_REPORT
*&---------------------------------------------------------------------*
*& Purpose : Sales Order reporting for SAP ERP (SAP ECC 6.0).
*&           Reads Sales Order Header/Item data, Header status data,
*&           Header long text and Item long text, the Sold-to name and
*&           status descriptions, and displays them in an interactive
*&           ALV grid with drill-down into VA03.
*&
*& Tables   : VBAK - Sales Document: Header Data
*&            VBAP - Sales Document: Item Data
*&            VBUK - Sales Document: Header Status and Administrative Data
*&            STXH - SAPscript Text File Header (long text existence)
*&            KNA1 - Customer Master (Sold-to name)
*&
*& Long texts are SAPscript texts. STXH is the text header index; the
*& text lines are retrieved with function module READ_TEXT:
*&   - Header text : object VBBK / id 0001 / name = VBELN
*&   - Item text   : object VBBP / id 0001 / name = VBELN + POSNR
*&
*& Status descriptions (GBSTK/LFSTK/FKSTK/ABSTK) come from the fixed
*& values of domain STATV.
*&
*& Double-click on a row opens the sales order in VA03.
*&---------------------------------------------------------------------*
REPORT zsd_sales_order_report LINE-SIZE 255.

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
TYPES: BEGIN OF ty_output,
         vbeln      TYPE vbak-vbeln,   " Sales Document
         auart      TYPE vbak-auart,   " Sales Document Type
         erdat      TYPE vbak-erdat,   " Created On
         ernam      TYPE vbak-ernam,   " Created By
         vkorg      TYPE vbak-vkorg,   " Sales Organization
         vtweg      TYPE vbak-vtweg,   " Distribution Channel
         spart      TYPE vbak-spart,   " Division
         kunnr      TYPE vbak-kunnr,   " Sold-to Party
         name1      TYPE kna1-name1,   " Sold-to Name
         netwr_hdr  TYPE vbak-netwr,   " Net Value (Header)
         waerk      TYPE vbak-waerk,   " Document Currency
         posnr      TYPE vbap-posnr,   " Item Number
         matnr      TYPE vbap-matnr,   " Material Number
         arktx      TYPE vbap-arktx,   " Item Description
         kwmeng     TYPE vbap-kwmeng,  " Order Quantity
         vrkme      TYPE vbap-vrkme,   " Sales Unit
         netwr_itm  TYPE vbap-netwr,   " Net Value (Item)
         werks      TYPE vbap-werks,   " Plant
         gbstk      TYPE vbuk-gbstk,   " Overall Processing Status
         gbstk_txt  TYPE dd07v-ddtext, " ...description
         lfstk      TYPE vbuk-lfstk,   " Overall Delivery Status
         lfstk_txt  TYPE dd07v-ddtext, " ...description
         fkstk      TYPE vbuk-fkstk,   " Overall Billing Status
         fkstk_txt  TYPE dd07v-ddtext, " ...description
         abstk      TYPE vbuk-abstk,   " Overall Rejection Status
         abstk_txt  TYPE dd07v-ddtext, " ...description
         header_text TYPE string,      " Header long text - id 0001
         text_z020   TYPE string,      " Header text - id Z020
         text_z037   TYPE string,      " Header text - id Z037
         text_z086   TYPE string,      " Header text - id Z086
         item_text   TYPE string,      " Item long text (concatenated)
       END OF ty_output.

* Driver table for the STXH FOR ALL ENTRIES read. TDNAME is CHAR 70,
* while VBELN/VBELN+POSNR are shorter - old releases require identical
* type and length in the FOR ALL ENTRIES comparison, so the key is typed
* here as STXH-TDNAME.
TYPES: BEGIN OF ty_name,
         tdname TYPE stxh-tdname,
       END OF ty_name.

* Sold-to name buffer (KUNNR -> NAME1)
TYPES: BEGIN OF ty_kna1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
       END OF ty_kna1.

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
      gt_vbuk   TYPE STANDARD TABLE OF vbuk,
      gt_stxh   TYPE STANDARD TABLE OF stxh,   " header text index (VBBK)
      gt_stxi   TYPE STANDARD TABLE OF stxh,   " item text index   (VBBP)
      gt_kna1   TYPE STANDARD TABLE OF ty_kna1,
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
*&      Read all data from the database
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

* --- Header Status (VBUK) ---
  SELECT * FROM vbuk
    INTO TABLE gt_vbuk
    FOR ALL ENTRIES IN gt_vbak
    WHERE vbeln = gt_vbak-vbeln.

* --- Sold-to name (KNA1) ---
  SELECT kunnr name1 FROM kna1
    INTO TABLE gt_kna1
    FOR ALL ENTRIES IN gt_vbak
    WHERE kunnr = gt_vbak-kunnr.
  SORT gt_kna1 BY kunnr.

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
      gs_name-tdname = ls_vbak-vbeln.     " widening CHAR10 -> CHAR70
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
  SORT gt_vbuk BY vbeln.
  SORT gt_stxh BY tdname tdid.
  SORT gt_stxi BY tdname.

ENDFORM.                    "get_data

*&---------------------------------------------------------------------*
*&      Form  LOAD_STATUS_TEXTS
*&---------------------------------------------------------------------*
*&      Read the fixed-value descriptions of domain STATV, shared by the
*&      overall status fields GBSTK / LFSTK / FKSTK / ABSTK.
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
*&      Return the description of a single-char status code.
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
*&      Merge header, item, status, texts and names into the output table
*&---------------------------------------------------------------------*
FORM build_output.

  DATA: ls_vbak TYPE vbak,
        ls_vbap TYPE vbap,
        ls_vbuk TYPE vbuk,
        ls_kna1 TYPE ty_kna1,
        lv_htext TYPE string,
        lv_z020  TYPE string,
        lv_z037  TYPE string,
        lv_z086  TYPE string,
        lv_itext TYPE string,
        lv_name1     TYPE kna1-name1,
        lv_gbstk_txt TYPE dd07v-ddtext,
        lv_lfstk_txt TYPE dd07v-ddtext,
        lv_fkstk_txt TYPE dd07v-ddtext,
        lv_abstk_txt TYPE dd07v-ddtext.

  LOOP AT gt_vbak INTO ls_vbak.

*   Header status (VBUK) - one record per header
    CLEAR ls_vbuk.
    READ TABLE gt_vbuk INTO ls_vbuk
         WITH KEY vbeln = ls_vbak-vbeln BINARY SEARCH.

*   Status descriptions (header level - compute once per header)
    PERFORM status_text USING ls_vbuk-gbstk CHANGING lv_gbstk_txt.
    PERFORM status_text USING ls_vbuk-lfstk CHANGING lv_lfstk_txt.
    PERFORM status_text USING ls_vbuk-fkstk CHANGING lv_fkstk_txt.
    PERFORM status_text USING ls_vbuk-abstk CHANGING lv_abstk_txt.

*   Sold-to name (KNA1)
    CLEAR lv_name1.
    READ TABLE gt_kna1 INTO ls_kna1
         WITH KEY kunnr = ls_vbak-kunnr BINARY SEARCH.
    IF sy-subrc = 0.
      lv_name1 = ls_kna1-name1.
    ENDIF.

*   Header long texts (read once per header, one per text ID)
    CLEAR: lv_htext, lv_z020, lv_z037, lv_z086.
    IF p_text = abap_true.
      PERFORM read_header_text_id USING ls_vbak-vbeln '0001'
                               CHANGING lv_htext.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z020'
                               CHANGING lv_z020.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z037'
                               CHANGING lv_z037.
      PERFORM read_header_text_id USING ls_vbak-vbeln 'Z086'
                               CHANGING lv_z086.
    ENDIF.

*   Expand items - one output row per item
    LOOP AT gt_vbap INTO ls_vbap WHERE vbeln = ls_vbak-vbeln.

      CLEAR gs_output.

*     Header fields
      gs_output-vbeln     = ls_vbak-vbeln.
      gs_output-auart     = ls_vbak-auart.
      gs_output-erdat     = ls_vbak-erdat.
      gs_output-ernam     = ls_vbak-ernam.
      gs_output-vkorg     = ls_vbak-vkorg.
      gs_output-vtweg     = ls_vbak-vtweg.
      gs_output-spart     = ls_vbak-spart.
      gs_output-kunnr     = ls_vbak-kunnr.
      gs_output-name1     = lv_name1.
      gs_output-netwr_hdr = ls_vbak-netwr.
      gs_output-waerk     = ls_vbak-waerk.

*     Item fields
      gs_output-posnr     = ls_vbap-posnr.
      gs_output-matnr     = ls_vbap-matnr.
      gs_output-arktx     = ls_vbap-arktx.
      gs_output-kwmeng    = ls_vbap-kwmeng.
      gs_output-vrkme     = ls_vbap-vrkme.
      gs_output-netwr_itm = ls_vbap-netwr.
      gs_output-werks     = ls_vbap-werks.

*     Status fields (code + description)
      gs_output-gbstk     = ls_vbuk-gbstk.
      gs_output-gbstk_txt = lv_gbstk_txt.
      gs_output-lfstk     = ls_vbuk-lfstk.
      gs_output-lfstk_txt = lv_lfstk_txt.
      gs_output-fkstk     = ls_vbuk-fkstk.
      gs_output-fkstk_txt = lv_fkstk_txt.
      gs_output-abstk     = ls_vbuk-abstk.
      gs_output-abstk_txt = lv_abstk_txt.

*     Header long texts (by text ID)
      gs_output-header_text = lv_htext.
      gs_output-text_z020   = lv_z020.
      gs_output-text_z037   = lv_z037.
      gs_output-text_z086   = lv_z086.

*     Item long text (read per item)
      CLEAR lv_itext.
      IF p_itext = abap_true.
        PERFORM read_item_text USING ls_vbap-vbeln ls_vbap-posnr
                            CHANGING lv_itext.
      ENDIF.
      gs_output-item_text = lv_itext.

      APPEND gs_output TO gt_output.
    ENDLOOP.

*   Header without items - still output one row
    IF sy-subrc <> 0.
      CLEAR gs_output.
      gs_output-vbeln       = ls_vbak-vbeln.
      gs_output-auart       = ls_vbak-auart.
      gs_output-erdat       = ls_vbak-erdat.
      gs_output-ernam       = ls_vbak-ernam.
      gs_output-vkorg       = ls_vbak-vkorg.
      gs_output-vtweg       = ls_vbak-vtweg.
      gs_output-spart       = ls_vbak-spart.
      gs_output-kunnr       = ls_vbak-kunnr.
      gs_output-name1       = lv_name1.
      gs_output-netwr_hdr   = ls_vbak-netwr.
      gs_output-waerk       = ls_vbak-waerk.
      gs_output-gbstk       = ls_vbuk-gbstk.
      gs_output-gbstk_txt   = lv_gbstk_txt.
      gs_output-lfstk       = ls_vbuk-lfstk.
      gs_output-lfstk_txt   = lv_lfstk_txt.
      gs_output-fkstk       = ls_vbuk-fkstk.
      gs_output-fkstk_txt   = lv_fkstk_txt.
      gs_output-abstk       = ls_vbuk-abstk.
      gs_output-abstk_txt   = lv_abstk_txt.
      gs_output-header_text = lv_htext.
      gs_output-text_z020   = lv_z020.
      gs_output-text_z037   = lv_z037.
      gs_output-text_z086   = lv_z086.
      APPEND gs_output TO gt_output.
    ENDIF.

  ENDLOOP.

ENDFORM.                    "build_output

*&---------------------------------------------------------------------*
*&      Form  READ_HEADER_TEXT_ID
*&---------------------------------------------------------------------*
*&      Read a sales order header text of a given text ID via READ_TEXT
*&      (object VBBK / name = VBELN). Only texts that have an STXH index
*&      entry for that ID are read (performance).
*&---------------------------------------------------------------------*
FORM read_header_text_id USING    iv_vbeln TYPE vbak-vbeln
                                  iv_tdid  TYPE stxh-tdid
                         CHANGING cv_text  TYPE string.

  DATA: lt_lines TYPE STANDARD TABLE OF tline,
        ls_line  TYPE tline,
        lv_name  TYPE thead-tdname.

  CLEAR cv_text.

* Only read text if index entry exists in STXH for this VBELN + ID
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
      CONCATENATE cv_text ls_line-tdline
             INTO cv_text SEPARATED BY space.
    ENDIF.
  ENDLOOP.

ENDFORM.                    "read_header_text_id

*&---------------------------------------------------------------------*
*&      Form  GET_ID_DESC
*&---------------------------------------------------------------------*
*&      Return the description of a header text ID (from TTXIT), with a
*&      generic fallback when no description is maintained.
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
*&      Read the sales order item long text via READ_TEXT.
*&      Text object VBBP / id 0001 / name = VBELN + POSNR.
*&      Only items that have an STXH entry are read (performance).
*&---------------------------------------------------------------------*
FORM read_item_text USING    iv_vbeln TYPE vbap-vbeln
                             iv_posnr TYPE vbap-posnr
                    CHANGING cv_text  TYPE string.

  DATA: lt_lines TYPE STANDARD TABLE OF tline,
        ls_line  TYPE tline,
        lv_name  TYPE thead-tdname.

  CONCATENATE iv_vbeln iv_posnr INTO lv_name.

* Only read text if index entry exists in STXH
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
      CONCATENATE cv_text ls_line-tdline
             INTO cv_text SEPARATED BY space.
    ENDIF.
  ENDLOOP.

ENDFORM.                    "read_item_text

*&---------------------------------------------------------------------*
*&      Form  BUILD_FIELDCAT
*&---------------------------------------------------------------------*
*&      Build the ALV field catalog
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

* Resolve the custom header text-ID descriptions for the headings
  PERFORM get_id_desc USING 'Z020' CHANGING lv_d020.
  PERFORM get_id_desc USING 'Z037' CHANGING lv_d037.
  PERFORM get_id_desc USING 'Z086' CHANGING lv_d086.

* --- 1) Document / item data first (document + item identifiers lead) --
  add_field 'VBELN'      'Sales Document'      10.
  add_field 'POSNR'      'Item'                 6.
  add_field 'MATNR'      'Material'            18.
  add_field 'ARKTX'      'Description'         40.
  add_field 'AUART'      'Order Type'           4.
  add_field 'ERDAT'      'Created On'          10.
  add_field 'ERNAM'      'Created By'          12.
  add_field 'KWMENG'     'Order Qty'           15.
  add_field 'VRKME'      'Unit'                 3.
  add_field 'WERKS'      'Plant'                4.
  add_field 'NETWR_ITM'  'Net Value (Item)'    15.
  add_field 'NETWR_HDR'  'Net Value (Hdr)'     15.
  add_field 'WAERK'      'Currency'             5.
  add_field 'KUNNR'      'Sold-to Party'       10.
  add_field 'NAME1'      'Sold-to Name'        35.
  add_field 'VKORG'      'Sales Org.'           4.
  add_field 'VTWEG'      'Distr. Channel'       2.
  add_field 'SPART'      'Division'             2.

* --- 2) Status columns (code + description) ---------------------------
  add_field 'GBSTK'      'Ov. Status'           3.
  add_field 'GBSTK_TXT'  'Overall Status Desc' 20.
  add_field 'LFSTK'      'Dlv. Status'          3.
  add_field 'LFSTK_TXT'  'Delivery Status Desc' 20.
  add_field 'FKSTK'      'Bill. Status'         3.
  add_field 'FKSTK_TXT'  'Billing Status Desc' 20.
  add_field 'ABSTK'      'Rej. Status'          3.
  add_field 'ABSTK_TXT'  'Rejection Status Desc' 20.

* --- 3) Text columns last ---------------------------------------------
  add_field 'HEADER_TEXT' 'Header Text (0001)' 60.
  add_field 'TEXT_Z020'  lv_d020               60.
  add_field 'TEXT_Z037'  lv_d037               60.
  add_field 'TEXT_Z086'  lv_d086               60.
  add_field 'ITEM_TEXT'  'Item Text'           60.

ENDFORM.                    "build_fieldcat

*&---------------------------------------------------------------------*
*&      Form  DISPLAY_ALV
*&---------------------------------------------------------------------*
*&      Display the output table in an ALV grid list
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
*&      ALV callback. Double-click (&IC1) opens the sales order in VA03.
*&      Called by REUSE_ALV_GRID_DISPLAY - signature is fixed.
*&---------------------------------------------------------------------*
FORM user_command USING r_ucomm     TYPE sy-ucomm
                        rs_selfield TYPE slis_selfield.

  CASE r_ucomm.
    WHEN '&IC1'.                       " double-click / pick
      CLEAR gs_output.
      READ TABLE gt_output INTO gs_output INDEX rs_selfield-tabindex.
      IF sy-subrc = 0 AND gs_output-vbeln IS NOT INITIAL.
        SET PARAMETER ID 'AUN' FIELD gs_output-vbeln.
        CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
      ENDIF.
  ENDCASE.

ENDFORM.                    "user_command
