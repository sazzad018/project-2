
import { GoogleGenAI } from "@google/genai";
import { SMSAutomationConfig, Order, WCStatus } from "../types";

export interface SMSConfig {
  endpoint: string;
  apiKey: string;
  senderId: string;
}

export interface SMSTemplate {
  id: string;
  name: string;
  content: string;
}

const fetchSetting = async (key: string): Promise<any> => {
  try {
    const res = await fetch(`api/settings.php?key=${key}`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text === "null") return null;
    try {
      const data = JSON.parse(text);
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      console.error(`Error parsing setting for key ${key}:`, e);
      return null;
    }
  } catch (e) {
    console.error(`Error fetching setting for key ${key}:`, e);
    return null;
  }
};

const saveSetting = async (key: string, value: any) => {
  try {
    await fetch(`api/settings.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: JSON.stringify(value) })
    });
  } catch (e) {
    console.error(`Error saving setting ${key}:`, e);
  }
};

export const getSMSConfig = async (): Promise<SMSConfig | null> => {
  return await fetchSetting('sms_config') as SMSConfig | null;
};

export const saveSMSConfig = async (config: SMSConfig) => {
  await saveSetting('sms_config', config);
};

export const getCustomTemplates = async (): Promise<SMSTemplate[]> => {
  const templates = await fetchSetting('sms_templates');
  return (templates as SMSTemplate[]) || [];
};

export const saveCustomTemplates = async (templates: SMSTemplate[]) => {
  await saveSetting('sms_templates', templates);
};

export const getSMSAutomationConfig = async (): Promise<SMSAutomationConfig> => {
  const config = await fetchSetting('sms_automation_config');
  const defaultConfig: SMSAutomationConfig = {
    pending: { enabled: false, template: "Hi [name], your order #[order_id] is pending payment." },
    processing: { enabled: false, template: "Hi [name], your order #[order_id] is being processed." },
    'on-hold': { enabled: false, template: "Hi [name], your order #[order_id] is on hold." },
    completed: { enabled: false, template: "Hi [name], your order #[order_id] has been completed! Tracking: [tracking_code]" },
    cancelled: { enabled: false, template: "Hi [name], your order #[order_id] was cancelled." },
    refunded: { enabled: false, template: "Hi [name], your order #[order_id] has been refunded." },
    failed: { enabled: false, template: "Hi [name], your order #[order_id] has failed." }
  };
  return config || defaultConfig;
};

export const saveSMSAutomationConfig = async (config: SMSAutomationConfig) => {
  await saveSetting('sms_automation_config', config);
};

export const sendActualSMS = async (config: SMSConfig, phone: string, message: string): Promise<{success: boolean, message: string}> => {
  try {
    const gsmRegex = /^[\u0000-\u007F]*$/;
    const isUnicode = !gsmRegex.test(message);
    const type = isUnicode ? 'unicode' : 'text';

    let formattedPhone = phone.trim().replace(/[^\d]/g, '');
    if (formattedPhone.length === 11 && formattedPhone.startsWith('01')) {
      formattedPhone = '88' + formattedPhone;
    }

    const response = await fetch('api/send_sms.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.apiKey,
        senderid: config.senderId,
        type: type,
        msg: message,
        contacts: formattedPhone
      })
    });
    
    if (!response.ok) {
      return { success: false, message: `Server Error: ${response.statusText}` };
    }
    
    return await response.json();
  } catch (error: any) {
    console.error("SMS sending failed:", error);
    return { success: false, message: error.message || 'Unknown network error' };
  }
};

export const triggerAutomationSMS = async (order: Order, newStatus: WCStatus) => {
  try {
    const [config, autoSettings] = await Promise.all([
      getSMSConfig(),
      getSMSAutomationConfig()
    ]);

    if (!config || !config.apiKey) return;

    const setting = autoSettings[newStatus];
    if (setting && setting.enabled && setting.template) {
      const firstName = order.customer.name.split(' ')[0] || 'Customer';
      const message = setting.template
        .replace(/\[name\]/g, firstName)
        .replace(/\[order_id\]/g, order.id)
        .replace(/\[tracking_code\]/g, order.courier_tracking_code || 'Pending');

      console.log(`[SMS Automation] Triggered for Order ${order.id} - Status: ${newStatus}`);
      return await sendActualSMS(config, order.customer.phone, message);
    }
  } catch (e) {
    console.error("SMS Automation trigger failed:", e);
  }
};

export const generateSMSTemplate = async (purpose: string, businessName: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Create a professional SMS message for "${businessName}". Purpose: "${purpose}". Use [name] for customer name, [order_id] for order id, [tracking_code] for tracking. Short & crisp.`,
    });
    return response.text?.trim() || "Hello [name], thank you for shopping with us!";
  } catch (error) {
    console.error("Gemini SMS template generation failed:", error);
    return "Hello [name], check out our new collection!";
  }
};
