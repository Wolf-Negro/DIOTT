// ==========================================
// ZONA DE CONFIGURACIÓN
// ==========================================
const ACCESS_TOKEN = 'EAAWZBTP4UaC4BQ2jxRmgVZAPPxtM5uEETxSrEPu2J4MBCbteoIzn8gHt05WbgRcQFsZBq0rjCjy2xKc5rjhCyp5glzFb7SPq5M1HzU38HwnxKbXcBAwPDPP9WFudkbgcZCxgHW6rBRasppLKW25qPKKY6BV5rmqZCMEG10tejCyZAwVpNZCJ1jAaKR0JufZC';

const CLIENTES = [
    {
        idDOM: 'client-1',
        accountId: 'act_211498229755440',
        name: 'Khall Shop'
    },
    {
        idDOM: 'client-2', 
        accountId: 'act_1490871118919732',
        name: 'Dentti'
    }
];
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    startDateInput.value = formattedDate;
    endDateInput.value = formattedDate;

    const actualizarDatos = () => {
        const start = startDateInput.value;
        const end = endDateInput.value;
        
        if(start > end) {
            alert("¡Animal! La fecha de inicio no puede ser mayor a la fecha final.");
            return;
        }
        
        CLIENTES.forEach(cliente => {
            const card = document.getElementById(cliente.idDOM);
            card.querySelector('h2').textContent = `Cargando ${cliente.name}...`;
            card.querySelector('.spend').textContent = "...";
            card.querySelector('.cpa').textContent = "...";
            card.querySelector('.results').textContent = "...";
        });

        cargarDatos(start, end);
    };

    startDateInput.addEventListener('change', actualizarDatos);
    endDateInput.addEventListener('change', actualizarDatos);

    cargarDatos(formattedDate, formattedDate);
});

async function cargarDatos(fechaInicio, fechaFin) {
    const timeRange = JSON.stringify({ since: fechaInicio, until: fechaFin });

    for (const cliente of CLIENTES) {
        const card = document.getElementById(cliente.idDOM);
        card.querySelector('h2').textContent = cliente.name;

        // Ya no pedimos el cost_per_action_type a Meta, lo calcularemos nosotros para que sea 100% exacto
        const url = `https://graph.facebook.com/v19.0/${cliente.accountId}/insights?fields=spend,actions&time_range=${timeRange}&access_token=${ACCESS_TOKEN}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error(`Error en ${cliente.name}:`, data.error.message);
                mostrarError(card);
                continue;
            }

            if (data.data && data.data.length > 0) {
                const metricas = data.data[0];
                const gasto = parseFloat(metricas.spend) || 0;
                
                // Buscar específicamente las conversaciones de WhatsApp/Messenger
                let mensajes = 0;
                if (metricas.actions) {
                    const accionMensajes = metricas.actions.find(a => 
                        a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                        a.action_type === 'onsite_conversion.messaging_first_reply' ||
                        a.action_type === 'messaging_conversation_started_7d'
                    );
                    
                    if (accionMensajes) {
                        mensajes = parseFloat(accionMensajes.value);
                    }
                }

                // Cálculo manual exacto del CPA
                let cpa = 0;
                if (mensajes > 0) {
                    cpa = gasto / mensajes;
                }

                actualizarTarjeta(card, gasto, cpa, mensajes);
            } else {
                actualizarTarjeta(card, 0, 0, 0);
            }

        } catch (error) {
            console.error("Error de conexión:", error);
            mostrarError(card);
        }
    }
}

function actualizarTarjeta(cardDOM, gasto, cpa, resultados) {
    cardDOM.querySelector('.spend').textContent = `S/ ${parseFloat(gasto).toFixed(2)}`;
    cardDOM.querySelector('.cpa').textContent = `S/ ${parseFloat(cpa).toFixed(2)}`;
    cardDOM.querySelector('.results').textContent = resultados;
}

function mostrarError(cardDOM) {
    cardDOM.querySelector('.spend').textContent = "Error";
    cardDOM.querySelector('.cpa').textContent = "Error";
    cardDOM.querySelector('.results').textContent = "Error";
}