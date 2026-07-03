*&---------------------------------------------------------------------*
*& Report  ZSD_SALES_ORDER_REPORT
*&---------------------------------------------------------------------*
*& Purpose : Sales Order reporting for SAP ERP (SAP ECC 6.0).
*&           Reads Sales Order Header/Item data, Header status data and
*&           Header long text, and displays them in an interactive ALV
*&           grid list.
*&
*& Tables   : VBAK - Sales Document: Header Data
*&            VBAP - Sales Document: Item Data
*&            VBUK - Sales Document: Header Status and Administrative Data
*&            STXH - SAPscript Text File Header (long text existence)
*&
*& Header long text is stored as SAPscript text. STXH is the text header
*& index (object VBBK / text-id 0001 = sales order header note). The
*& actual text lines are retrieved with function module READ_TEXT.
*&---------------------------------------------------------------------*
REPORT zsd_sales_order_report LINE-SIZE 255.

*&---------------------------------------------------------------------*
*& Type pools
*&---------------------------------------------------------------------*
TYPE-POOLS: slis.

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
         lfstk      TYPE vbuk-lfstk,   " Overall Delivery Status
         fkstk      TYPE vbuk-fkstk,   " Overall Billing Status
         abstk      TYPE vbuk-abstk,   " Overall Rejection Status
         header_text TYPE string,      " Header long text (concatenated)
       END OF ty_output.

*&---------------------------------------------------------------------*
*& Global data
*&---------------------------------------------------------------------*
DATA: gt_vbak   TYPE STANDARD TABLE OF vbak,
      gt_vbap   TYPE STANDARD TABLE OF vbap,
      gt_vbuk   TYPE STANDARD TABLE OF vbuk,
      gt_stxh   TYPE STANDARD TABLE OF stxh,
      gt_output TYPE STANDARD TABLE OF ty_output,
      gs_output TYPE ty_output.

DATA: gt_fieldcat TYPE slis_t_fieldcat_alv,
      gs_layout   TYPE slis_layout_alv.

*&---------------------------------------------------------------------*
*& Selection screen
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-s01.
SELECT-OPTIONS: s_vbeln FOR gt_output-vbeln,   " Sales Document
                s_auart FOR gt_output-auart,   " Order Type
                s_vkorg FOR gt_output-vkorg,   " Sales Organization
                s_kunnr FOR gt_output-kunnr,   " Sold-to Party
                s_erdat FOR gt_output-erdat.   " Created On
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-s02.
PARAMETERS: p_text AS CHECKBOX DEFAULT 'X'.    " Read Header Long Text
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
*&      Read header, item, status and text-header data from the database
*&---------------------------------------------------------------------*
FORM get_data.

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

* --- Header Text index (STXH) : object VBBK / id 0001 ---
  IF p_text = abap_true.
    SELECT * FROM stxh
      INTO TABLE gt_stxh
      FOR ALL ENTRIES IN gt_vbak
      WHERE tdobject = 'VBBK'
        AND tdname   = gt_vbak-vbeln
        AND tdid     = '0001'.
  ENDIF.

* Sort internal tables for fast READ TABLE ... BINARY SEARCH
  SORT gt_vbap BY vbeln posnr.
  SORT gt_vbuk BY vbeln.
  SORT gt_stxh BY tdname.

ENDFORM.                    "get_data

*&---------------------------------------------------------------------*
*&      Form  BUILD_OUTPUT
*&---------------------------------------------------------------------*
*&      Merge header, item, status and long text into the output table
*&---------------------------------------------------------------------*
FORM build_output.

  DATA: ls_vbak TYPE vbak,
        ls_vbap TYPE vbap,
        ls_vbuk TYPE vbuk,
        lv_text TYPE string.

  LOOP AT gt_vbak INTO ls_vbak.

*   Header status (VBUK) - one record per header
    CLEAR ls_vbuk.
    READ TABLE gt_vbuk INTO ls_vbuk
         WITH KEY vbeln = ls_vbak-vbeln BINARY SEARCH.

*   Header long text (read once per header)
    CLEAR lv_text.
    IF p_text = abap_true.
      PERFORM read_header_text USING ls_vbak-vbeln
                            CHANGING lv_text.
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

*     Status fields
      gs_output-gbstk     = ls_vbuk-gbstk.
      gs_output-lfstk     = ls_vbuk-lfstk.
      gs_output-fkstk     = ls_vbuk-fkstk.
      gs_output-abstk     = ls_vbuk-abstk.

*     Header long text
      gs_output-header_text = lv_text.

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
      gs_output-netwr_hdr   = ls_vbak-netwr.
      gs_output-waerk       = ls_vbak-waerk.
      gs_output-gbstk       = ls_vbuk-gbstk.
      gs_output-lfstk       = ls_vbuk-lfstk.
      gs_output-fkstk       = ls_vbuk-fkstk.
      gs_output-abstk       = ls_vbuk-abstk.
      gs_output-header_text = lv_text.
      APPEND gs_output TO gt_output.
    ENDIF.

  ENDLOOP.

ENDFORM.                    "build_output

*&---------------------------------------------------------------------*
*&      Form  READ_HEADER_TEXT
*&---------------------------------------------------------------------*
*&      Read the sales order header long text via READ_TEXT.
*&      Only headers that have an STXH entry are read (performance).
*&---------------------------------------------------------------------*
FORM read_header_text USING    iv_vbeln TYPE vbak-vbeln
                      CHANGING cv_text  TYPE string.

  DATA: lt_lines TYPE STANDARD TABLE OF tline,
        ls_line  TYPE tline,
        lv_name  TYPE thead-tdname.

* Only read text if index entry exists in STXH
  READ TABLE gt_stxh TRANSPORTING NO FIELDS
       WITH KEY tdname = iv_vbeln BINARY SEARCH.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  lv_name = iv_vbeln.

  CALL FUNCTION 'READ_TEXT'
    EXPORTING
      id                      = '0001'
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

ENDFORM.                    "read_header_text

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

  DATA: gs_fieldcat TYPE slis_fieldcat_alv.

  add_field 'VBELN'      'Sales Document'      10.
  add_field 'AUART'      'Order Type'           4.
  add_field 'ERDAT'      'Created On'          10.
  add_field 'ERNAM'      'Created By'          12.
  add_field 'VKORG'      'Sales Org.'           4.
  add_field 'VTWEG'      'Distr. Channel'       2.
  add_field 'SPART'      'Division'             2.
  add_field 'KUNNR'      'Sold-to Party'       10.
  add_field 'NETWR_HDR'  'Net Value (Hdr)'     15.
  add_field 'WAERK'      'Currency'             5.
  add_field 'POSNR'      'Item'                 6.
  add_field 'MATNR'      'Material'            18.
  add_field 'ARKTX'      'Description'         40.
  add_field 'KWMENG'     'Order Qty'           15.
  add_field 'VRKME'      'Unit'                 3.
  add_field 'NETWR_ITM'  'Net Value (Item)'    15.
  add_field 'WERKS'      'Plant'                4.
  add_field 'GBSTK'      'Overall Status'       1.
  add_field 'LFSTK'      'Delivery Status'      1.
  add_field 'FKSTK'      'Billing Status'       1.
  add_field 'ABSTK'      'Rejection Status'     1.
  add_field 'HEADER_TEXT' 'Header Text'        60.

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
      i_callback_program = sy-repid
      is_layout          = gs_layout
      it_fieldcat        = gt_fieldcat
      i_save             = 'A'
    TABLES
      t_outtab           = gt_output
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.

  IF sy-subrc <> 0.
    MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
  ENDIF.

ENDFORM.                    "display_alv
