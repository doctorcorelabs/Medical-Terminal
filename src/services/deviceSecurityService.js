import { supabase } from './supabaseClient';
import { getOrCreateDeviceId, getOrCreateSessionId } from './swConfig';
import { getDeviceName, fetchIpLocation } from '../utils/deviceDetection.js';

export const DEFAULT_MAX_ACTIVE_DEVICES = 2;

const REVOKE_DENY_REASONS = new Set([
    'admin_ban_enforced',
    'admin_manual_revoke',
    'device_limit_auto_revoke',
]);

export async function registerCurrentDeviceSession(userId, maxDevices = DEFAULT_MAX_ACTIVE_DEVICES) {
    if (!userId) return { data: null, error: null };

    const deviceId = getOrCreateDeviceId();
    const sessionId = getOrCreateSessionId();
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    const deviceName = getDeviceName();
    const locationMetadata = await fetchIpLocation();

    const result = await supabase.rpc('register_user_device_session', {
        p_user_id: userId,
        p_device_id: deviceId,
        p_user_agent: userAgent,
        p_device_name: deviceName,
        p_max_devices: maxDevices,
        p_session_id: sessionId,
        p_location_metadata: locationMetadata,
    });

    return {
        data: result.data,
        error: result.error,
        deviceId,
        sessionId,
    };
}

export async function isUserBanned(userId) {
    const status = await getUserBanStatus(userId);
    return status.isBanned;
}

export async function getUserBanStatus(userId) {
    if (!userId) {
        return {
            isBanned: false,
            reason: null,
            banExpiresAt: null,
        };
    }

    const { data, error } = await supabase
        .from('user_ban_policies')
        .select('is_banned, reason, ban_expires_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) {
        return {
            isBanned: false,
            reason: null,
            banExpiresAt: null,
        };
    }

    const nowIso = new Date().toISOString();
    const hasExpiry = Boolean(data.ban_expires_at);
    const isExpired = hasExpiry && data.ban_expires_at <= nowIso;
    const isBanned = data.is_banned === true && !isExpired;

    return {
        isBanned,
        reason: data.reason || null,
        banExpiresAt: data.ban_expires_at || null,
    };
}

export async function deactivateCurrentDeviceSession(userId) {
    if (!userId) return;

    const sessionId = getOrCreateSessionId();
    const deviceId = getOrCreateDeviceId(); // Keep device_id for reference if needed, but we target session_id

    await supabase
        .from('user_login_sessions')
        .update({
            is_active: false,
            revoked_at: new Date().toISOString(),
            revoke_reason: 'user_sign_out',
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('is_active', true);

    await supabase
        .from('user_devices')
        .update({
            revoked_at: new Date().toISOString(),
            revoked_reason: 'user_sign_out',
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .is('revoked_at', null);
}

export async function isCurrentDeviceSessionActive(userId) {
    if (!userId) return true;

    const sessionId = getOrCreateSessionId();

    const { data, error } = await supabase
        .from('user_login_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .limit(1);

    if (error) {
        // Fail open on transient errors to avoid kicking valid users offline.
        return true;
    }

    return (data?.length || 0) > 0;
}

export async function getCurrentDeviceRevocationStatus(userId) {
    if (!userId) {
        return {
            isRevoked: false,
            revokeReason: null,
            revokedAt: null,
        };
    }

    const sessionId = getOrCreateSessionId();

    const { data, error } = await supabase
        .from('user_login_sessions')
        .select('is_active, revoke_reason, revoked_at, revoke_message_custom')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) {
        return {
            isRevoked: false,
            revokeReason: null,
            revokedAt: null,
            revokeMessage: null,
        };
    }

    const hasRevokeFlag = data.is_active === false && Boolean(data.revoked_at);
    const denyReason = REVOKE_DENY_REASONS.has(data.revoke_reason || '');

    return {
        isRevoked: hasRevokeFlag && denyReason,
        revokeReason: data.revoke_reason || null,
        revokedAt: data.revoked_at || null,
        revokeMessage: data.revoke_message_custom || null,
    };
}
