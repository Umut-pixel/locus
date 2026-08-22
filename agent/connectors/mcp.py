"""MCP connector'ları — v2 iskelesi.

v1'de aktif DEĞİL (plan kararı: n8n v2'ye ertelendi). Bu dosya, n8n
aksiyon workflow'ları bağlanacağı zaman düzenlenmek üzere duruyor.

v2'de bağlanacaklar:
  - Panorama sync tetikleme
  - Rapor gönderme / bildirim
  - Potansiyel müşteri tarama workflow'u

Güvenlik notu: n8n webhook'ları YAZMA/aksiyon yüzeyidir. Bağlanırken
`include_tools` ile yalnız gereken araçlar açılmalı, tüm sunucu değil.
"""

# from managed_deepagents import connectors
#
# connector = connectors.mcp(
#     mcp_servers={
#         "n8n": {
#             "transport": "http",
#             "url": os.environ["N8N_MCP_URL"],
#             "include_tools": ["trigger_panorama_sync"],  # yalnız gerekli olanlar
#         },
#     },
# )
