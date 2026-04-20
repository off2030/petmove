-- Payment fields: amount and method
insert into field_definitions
  (org_id, key, label, type, group_name, display_order, options, countries, is_step, is_active)
values
  (null, 'payment_amount', '결제 금액', 'number', '메모', 95, null, null, false, true),
  (null, 'payment_method', '결제 방식', 'select', '메모', 96,
    '[{"value":"cash","label_ko":"현금","label_en":"Cash"},
      {"value":"cash_receipt","label_ko":"현금영수증","label_en":"Cash Receipt"},
      {"value":"card","label_ko":"카드","label_en":"Card"}]'::jsonb,
    null, false, true)
on conflict (org_id, key) do nothing;
