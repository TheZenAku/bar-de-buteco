// Canonical joint names (Nathan's) for the Mixamo skeleton, shared by skins and animation sources.
const names = new Map([
  ['Hips','hip'],['Spine','spine_01'],['Spine1','spine_02'],['Spine2','spine_03'],['Neck','neck'],['Head','head'],['HeadTop_End','head_end'],
  ['LeftShoulder','shoulder_l'],['LeftArm','upperarm_l'],['LeftForeArm','lowerarm_l'],['LeftHand','hand_l'],
  ['RightShoulder','shoulder_r'],['RightArm','upperarm_r'],['RightForeArm','lowerarm_r'],['RightHand','hand_r'],
  ['LeftUpLeg','upperleg_l'],['LeftLeg','lowerleg_l'],['LeftFoot','foot_l'],['LeftToeBase','toe_l'],['LeftToe_End','toe_end_l'],
  ['RightUpLeg','upperleg_r'],['RightLeg','lowerleg_r'],['RightFoot','foot_r'],['RightToeBase','toe_r'],['RightToe_End','toe_end_r'],
]);
for (const side of ['Left','Right']) for (const finger of ['Thumb','Index','Middle','Ring','Pinky']) for (let joint = 1; joint <= 4; joint++)
  names.set(`${side}Hand${finger}${joint}`, `${finger.toLowerCase()}_0${joint}_${side === 'Left' ? 'l' : 'r'}`);

/** `mixamorigLeftArm` (or `LeftArm`) -> `upperarm_l`; undefined for names outside the Mixamo skeleton. */
export const mixamoBoneName = name => names.get(name.replace(/^mixamorig\d*:?/, ''));
