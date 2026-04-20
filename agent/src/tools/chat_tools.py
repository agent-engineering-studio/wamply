"""
Definizioni degli strumenti Claude (tool_use) per il chat agent di Wamply.

Esporta CHAT_TOOLS: lista di 25 schemi Anthropic tool per operazioni
sui contatti, campagne, template, analytics e impostazioni.
"""

CHAT_TOOLS: list[dict] = [
    # ------------------------------------------------------------------ #
    # Contatti (5 tools)                                                   #
    # ------------------------------------------------------------------ #
    {
        "name": "list_contacts",
        "description": "Elenca e cerca i contatti. Supporta ricerca testuale, filtro per tag e paginazione.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Testo da cercare nel nome, telefono o email del contatto.",
                },
                "tag": {
                    "type": "string",
                    "description": "Filtra i contatti per tag specifico.",
                },
                "page": {
                    "type": "integer",
                    "description": "Numero di pagina per la paginazione (default 1).",
                    "minimum": 1,
                },
            },
            "required": [],
        },
    },
    {
        "name": "add_contact",
        "description": "Aggiunge un nuovo contatto alla rubrica. Il numero di telefono è obbligatorio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "phone": {
                    "type": "string",
                    "description": "Numero di telefono in formato internazionale (es. +39xxxxxxxxxx).",
                },
                "name": {
                    "type": "string",
                    "description": "Nome del contatto.",
                },
                "email": {
                    "type": "string",
                    "description": "Indirizzo email del contatto.",
                },
                "language": {
                    "type": "string",
                    "description": "Lingua preferita del contatto (es. it, en).",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Lista di tag da associare al contatto.",
                },
            },
            "required": ["phone"],
        },
    },
    {
        "name": "update_contact",
        "description": "Aggiorna i dati di un contatto esistente identificato dal suo ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {
                    "type": "string",
                    "description": "ID univoco del contatto da aggiornare.",
                },
                "name": {
                    "type": "string",
                    "description": "Nuovo nome del contatto.",
                },
                "email": {
                    "type": "string",
                    "description": "Nuovo indirizzo email del contatto.",
                },
                "language": {
                    "type": "string",
                    "description": "Nuova lingua preferita del contatto.",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Nuova lista di tag del contatto (sovrascrive i precedenti).",
                },
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "delete_contact",
        "description": "Elimina un contatto dalla rubrica in modo permanente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {
                    "type": "string",
                    "description": "ID univoco del contatto da eliminare.",
                },
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "import_contacts",
        "description": "Importa in blocco una lista di contatti. Ogni contatto deve avere almeno il numero di telefono.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contacts": {
                    "type": "array",
                    "description": "Lista di contatti da importare.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "phone": {
                                "type": "string",
                                "description": "Numero di telefono in formato internazionale.",
                            },
                            "name": {
                                "type": "string",
                                "description": "Nome del contatto.",
                            },
                            "email": {
                                "type": "string",
                                "description": "Indirizzo email del contatto.",
                            },
                            "language": {
                                "type": "string",
                                "description": "Lingua preferita del contatto.",
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Tag del contatto.",
                            },
                        },
                        "required": ["phone"],
                    },
                },
            },
            "required": ["contacts"],
        },
    },
    # ------------------------------------------------------------------ #
    # Campagne (7 tools)                                                   #
    # ------------------------------------------------------------------ #
    {
        "name": "list_campaigns",
        "description": "Elenca tutte le campagne con un filtro opzionale per stato.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["draft", "scheduled", "running", "paused", "completed", "failed"],
                    "description": "Filtra le campagne per stato.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_campaign",
        "description": "Recupera i dettagli completi di una campagna tramite il suo ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "create_campaign",
        "description": "Crea una nuova campagna WhatsApp. Il nome è obbligatorio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Nome della campagna.",
                },
                "template_id": {
                    "type": "string",
                    "description": "ID del template WhatsApp da usare nella campagna.",
                },
                "group_id": {
                    "type": "string",
                    "description": "ID del gruppo di contatti a cui inviare la campagna.",
                },
                "scheduled_at": {
                    "type": "string",
                    "description": "Data e ora di invio pianificato in formato ISO 8601 (es. 2024-01-15T10:00:00Z).",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_campaign",
        "description": "Aggiorna una campagna esistente. Operazione consentita solo per campagne in stato draft o scheduled.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna da aggiornare.",
                },
                "name": {
                    "type": "string",
                    "description": "Nuovo nome della campagna.",
                },
                "template_id": {
                    "type": "string",
                    "description": "Nuovo ID del template WhatsApp.",
                },
                "group_id": {
                    "type": "string",
                    "description": "Nuovo ID del gruppo di contatti.",
                },
                "scheduled_at": {
                    "type": "string",
                    "description": "Nuova data e ora di invio pianificato in formato ISO 8601.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "launch_campaign",
        "description": "Avvia immediatamente l'invio di una campagna.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna da avviare.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "pause_campaign",
        "description": "Mette in pausa una campagna attualmente in esecuzione.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna da mettere in pausa.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "resume_campaign",
        "description": "Riprende l'esecuzione di una campagna precedentemente messa in pausa.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna da riprendere.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    # ------------------------------------------------------------------ #
    # Template (5 tools)                                                   #
    # ------------------------------------------------------------------ #
    {
        "name": "list_templates",
        "description": "Elenca tutti i template WhatsApp disponibili.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_template",
        "description": "Recupera i dettagli di un template WhatsApp tramite il suo ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {
                    "type": "string",
                    "description": "ID univoco del template.",
                },
            },
            "required": ["template_id"],
        },
    },
    {
        "name": "create_template",
        "description": "Crea un nuovo template WhatsApp. Il nome è obbligatorio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Nome del template.",
                },
                "category": {
                    "type": "string",
                    "enum": ["marketing", "utility", "authentication"],
                    "description": "Categoria del template.",
                },
                "language": {
                    "type": "string",
                    "description": "Codice lingua del template (es. it, en_US).",
                },
                "components": {
                    "type": "array",
                    "description": "Componenti del template (header, body, footer, buttons).",
                    "items": {
                        "type": "object",
                        "description": "Singolo componente del template.",
                    },
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_template",
        "description": "Aggiorna un template WhatsApp esistente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {
                    "type": "string",
                    "description": "ID univoco del template da aggiornare.",
                },
                "name": {
                    "type": "string",
                    "description": "Nuovo nome del template.",
                },
                "category": {
                    "type": "string",
                    "enum": ["marketing", "utility", "authentication"],
                    "description": "Nuova categoria del template.",
                },
                "language": {
                    "type": "string",
                    "description": "Nuovo codice lingua del template.",
                },
                "components": {
                    "type": "array",
                    "description": "Nuovi componenti del template.",
                    "items": {
                        "type": "object",
                        "description": "Singolo componente del template.",
                    },
                },
            },
            "required": ["template_id"],
        },
    },
    {
        "name": "delete_template",
        "description": "Elimina un template WhatsApp in modo permanente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {
                    "type": "string",
                    "description": "ID univoco del template da eliminare.",
                },
            },
            "required": ["template_id"],
        },
    },
    # ------------------------------------------------------------------ #
    # Dashboard & Analytics (3 tools)                                      #
    # ------------------------------------------------------------------ #
    {
        "name": "get_dashboard_stats",
        "description": "Recupera le statistiche generali della dashboard: contatti totali, messaggi inviati, tassi di consegna e lettura, campagne recenti.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_campaign_stats",
        "description": "Recupera le statistiche dettagliate di una singola campagna (inviati, consegnati, letti, falliti).",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID univoco della campagna di cui visualizzare le statistiche.",
                },
            },
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_message_history",
        "description": "Recupera il registro audit dei messaggi inviati con filtri opzionali per stato, campagna e limite di risultati.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["sent", "delivered", "read", "failed"],
                    "description": "Filtra i messaggi per stato.",
                },
                "campaign_id": {
                    "type": "string",
                    "description": "Filtra i messaggi per ID campagna.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Numero massimo di messaggi da restituire.",
                    "minimum": 1,
                    "maximum": 500,
                },
            },
            "required": [],
        },
    },
    # ------------------------------------------------------------------ #
    # Impostazioni (5 tools)                                               #
    # ------------------------------------------------------------------ #
    {
        "name": "get_whatsapp_config",
        "description": "Visualizza la configurazione Twilio per l'invio di messaggi WhatsApp Business.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_whatsapp_config",
        "description": "Aggiorna la configurazione Twilio WhatsApp. account_sid è obbligatorio; serve from_ oppure messaging_service_sid come mittente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "account_sid": {
                    "type": "string",
                    "description": "Twilio Account SID (inizia con AC...).",
                },
                "auth_token": {
                    "type": "string",
                    "description": "Twilio Auth Token (verrà cifrato prima del salvataggio).",
                },
                "from_": {
                    "type": "string",
                    "description": "Sender WhatsApp Twilio (es. 'whatsapp:+14155238886'). Lascia vuoto se usi messaging_service_sid.",
                },
                "messaging_service_sid": {
                    "type": "string",
                    "description": "Twilio Messaging Service SID (preferito in produzione, abilita sender pool/failover). Ha precedenza su from_.",
                },
                "business_name": {
                    "type": "string",
                    "description": "Nome visualizzato dell'azienda su WhatsApp.",
                },
                "default_language": {
                    "type": "string",
                    "description": "Lingua predefinita per i template (es. it, en_US).",
                },
            },
            "required": ["account_sid"],
        },
    },
    {
        "name": "get_ai_config",
        "description": "Visualizza la configurazione attuale dell'agente AI (modello, temperatura, token massimi).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "update_ai_config",
        "description": "Aggiorna la configurazione dell'agente AI.",
        "input_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "enum": [
                        "claude-opus-4-5",
                        "claude-sonnet-4-5",
                        "claude-haiku-4-5",
                        "claude-opus-4-0",
                        "claude-sonnet-4-0",
                    ],
                    "description": "Modello Claude da utilizzare per l'agente AI.",
                },
                "temperature": {
                    "type": "number",
                    "description": "Temperatura del modello (0 = deterministico, 1 = creativo).",
                    "minimum": 0,
                    "maximum": 1,
                },
                "max_tokens": {
                    "type": "integer",
                    "description": "Numero massimo di token nella risposta del modello.",
                    "minimum": 50,
                    "maximum": 4096,
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_plan_usage",
        "description": "Visualizza il piano attivo dell'account, i limiti del piano e l'utilizzo corrente (messaggi, contatti, campagne).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]
