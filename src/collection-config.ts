// Configuración de mapeo de palabras clave a colecciones de Bsale (moreka.shop - mkId=3)
// El sistema busca estas palabras en el nombre del producto y asigna la primera coincidencia

export interface CollectionMapping {
  collectionId: number;
  keywords: string[]; // palabras clave en minúscula
  name: string;
}

export const COLLECTION_MAPPINGS: CollectionMapping[] = [
  { collectionId: 104, name: "4 en 1", keywords: ["4 en 1", "4en1", "cuatro en uno"] },
  { collectionId: 114, name: "alcancia", keywords: ["alcancia", "alcancía", "ahorro", "moneda"] },
  { collectionId: 96, name: "Articulos de Temporada", keywords: ["temporada", "navidad", "halloween", "fiesta"] },
  { collectionId: 99, name: "Audífonos", keywords: ["audifono", "audífono", "earbuds", "headset", "auricular"] },
  { collectionId: 101, name: "Audifonos Alambricos", keywords: ["alambrico", "cableado", "con cable", "wired"] },
  { collectionId: 98, name: "Audifonos Bluetooth", keywords: ["bluetooth", "inalambrico", "wireless", "tws", "airpods"] },
  { collectionId: 85, name: "Audio", keywords: ["audio", "sonido", "musica"] },
  { collectionId: 95, name: "Auxiliar y Adaptadores", keywords: ["auxiliar", "adaptador", "adapter", "converter"] },
  { collectionId: 97, name: "Bocinas", keywords: ["bocina", "parlante", "speaker", "altavoz", "soundbar"] },
  { collectionId: 94, name: "Cables", keywords: ["cable", "extension", "cordón", "cord"] },
  { collectionId: 105, name: "Cargador cable tipo IP", keywords: ["lightning", "iphone", "ipad", "tipo ip"] },
  { collectionId: 110, name: "Cargador cable V8", keywords: ["v8", "micro v8", "samsung viejo"] },
  { collectionId: 109, name: "Cargador Tipo C", keywords: ["tipo c", "type c", "usb-c", "usbc"] },
  { collectionId: 93, name: "Cargadores", keywords: ["cargador", "charger", "carga", "adaptador corriente"] },
  { collectionId: 90, name: "Casa y jardín", keywords: ["casa", "hogar", "jardin", "jardín", "home"] },
  { collectionId: 82, name: "Celulares", keywords: ["celular", "telefono", "teléfono", "movil", "móvil", "smartphone"] },
  { collectionId: 111, name: "Cubos", keywords: ["cubo", "cube", "rubik", "magico"] },
  { collectionId: 112, name: "De auto", keywords: ["auto", "coche", "carro", "vehiculo", "automovil"] },
  { collectionId: 92, name: "De pared", keywords: ["pared", "muro", "wall"] },
  { collectionId: 100, name: "Diadema", keywords: ["diadema", "over ear", "over-ear"] },
  { collectionId: 89, name: "Electronica", keywords: ["electronica", "electrónica", "electronic"] },
  { collectionId: 116, name: "Exhibidor", keywords: ["exhibidor", "display", "mostrador", "stand"] },
  { collectionId: 84, name: "Fotografía", keywords: ["foto", "camara", "cámara", "lente", "tripie"] },
  { collectionId: 91, name: "Hogar", keywords: ["hogar", "casa", "home", "domestico"] },
  { collectionId: 88, name: "Iluminación", keywords: ["iluminacion", "luz", "lampara", "lámpara", "led", "foco", "bombillo"] },
  { collectionId: 80, name: "Impresoras", keywords: ["impresora", "printer", "toner"] },
  { collectionId: 102, name: "Intercomunicador", keywords: ["intercomunicador", "intercom", "radio comunicador"] },
  { collectionId: 106, name: "Lightning", keywords: ["lightning"] },
  { collectionId: 117, name: "Power bank", keywords: ["power bank", "bateria", "batería", "pila", "portatil"] },
  { collectionId: 115, name: "Reloj inteligente", keywords: ["reloj", "smartwatch", "watch", "pulsera"] },
  { collectionId: 113, name: "Soportes", keywords: ["soporte", "base", "holder", "stand", "tripie"] },
  { collectionId: 107, name: "Tipo C", keywords: ["tipo c", "type c", "usb-c"] },
  { collectionId: 103, name: "Tecnología", keywords: ["tecnologia", "tech", "gadget"] },
  { collectionId: 118, name: "Ventilador", keywords: ["ventilador", "ventilación", "fan", "cooler"] },
  { collectionId: 86, name: "Wearables", keywords: ["wearable", "fitness", "deportivo", "salud"] },
  { collectionId: 81, name: "Mas Vendidos", keywords: ["mas vendido", "popular", "best seller"] },
  { collectionId: 78, name: "productos destacados", keywords: ["destacado", "featured", "nuevo"] },
];

// Colecciones de mkId=3 que NO tienen mapeo aún (para referencia):
// 108: Micro USB
// 79: notebooks

/**
 * Encuentra la colección más apropiada según el nombre del producto
 * Devuelve el collectionId o null si no hay coincidencia
 */
export function findCollectionByProductName(productName: string): number | null {
  if (!productName) return null;
  
  const normalizedName = productName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const mapping of COLLECTION_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      const normalizedKeyword = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedName.includes(normalizedKeyword)) {
        return mapping.collectionId;
      }
    }
  }
  
  return null; // Sin coincidencia
}

/**
 * Devuelve el nombre de la colección por ID
 */
export function getCollectionName(collectionId: number): string | null {
  const mapping = COLLECTION_MAPPINGS.find(m => m.collectionId === collectionId);
  return mapping?.name || null;
}
